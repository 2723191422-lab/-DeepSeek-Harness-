/** Learning-data owner. Writes are serialized; multi-record failures freeze mutations until restart. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { learningDeskDomain, TABLES } from '../storage/domain.js';
import { settingsSchema } from '../storage/schema.js';
import { createTask, createDeck } from '../domain/models.js';
import { initCard, reviewCard } from '../domain/srs.js';
import { normalizeData, planFor, localDate } from '../ui/data.js';
import { elapsedMs, transitionTimer } from '../ui/timer.js';
const timerSchema = z.object({ id: z.string().min(1), status: z.enum(['running', 'paused']), start: z.number().min(0), resumedAt: z.number().min(0), accumulatedMs: z.number().min(0), targetMs: z.number().min(60000), mode: z.enum(['pomodoro', 'countup', 'break']), taskId: z.string().nullable(), courseId: z.string().nullable(), segments: z.array(z.object({ start: z.number(), end: z.number() })) });
/** Separate durable timer and daily-review metadata; no learning tables are duplicated. */
export const runtimeDomain = { name: 'learning_desk_runtime', version: 1, tables: {}, global: { schema: z.object({ timer: timerSchema.nullable(), review: z.object({ date: z.string(), count: z.number().int().min(0) }).optional() }), initial: { timer: null } } };
const commandSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('put'), table: z.enum(Object.keys(TABLES)), record: z.unknown() }),
    z.object({ type: z.literal('delete'), table: z.enum(Object.keys(TABLES)), id: z.string().min(1) }),
    z.object({ type: z.literal('review'), id: z.string().min(1), grade: z.enum(['again', 'hard', 'good', 'easy']) }),
    z.object({ type: z.literal('settings'), settings: settingsSchema }),
    z.object({ type: z.literal('import'), data: z.unknown() }),
    z.object({ type: z.literal('timer'), action: z.enum(['start', 'pause', 'resume', 'reset', 'finish']), minutes: z.number().min(1).max(1440).optional(), mode: z.enum(['pomodoro', 'countup', 'break']).optional(), taskId: z.string().nullable().optional(), courseId: z.string().nullable().optional() }),
]);
/** Open learning and timer metadata domains; callers own close().
 * @param {object} ctx - Cordis context with storageDomain.
 * @returns {Promise<object>} Desk service; failure closes any opened predecessor.
 */
export function openDesk(ctx) {
    return (async () => {
        const domain = await ctx.storageDomain.open(learningDeskDomain);
        let runtime;
        try {
            runtime = await ctx.storageDomain.open(runtimeDomain);
        }
        catch (error) {
            await domain.close();
            throw error;
        }
        return createDesk(domain, runtime);
    })();
}
/** Serialized service around validated durable Domain handles.
 * @param {object} domain - Open learning tables and settings.
 * @param {object} runtime - Open timer/review global.
 * @param {Function} clock - Epoch clock, injectable for recovery tests.
 * @param {Function} newId - Identifier allocator.
 * @returns {object} Read, command, tool and draining close methods.
 */
export function createDesk(domain, runtime, clock = Date.now, newId = randomUUID) {
    let chain = Promise.resolve();
    let stopped = false;
    let damaged = false;
    const pending = new Set();
    function snapshot() {
        return { version: 1, ...Object.fromEntries(Object.keys(TABLES).map(name => [name, [...domain.table(name).entries()].map(([, value]) => value)])), settings: domain.global.get(), timer: runtime.global.get().timer, reviewCount: runtime.global.get().review?.date === localDate(clock()) ? runtime.global.get().review.count : 0 };
    }
    function enqueue(work) {
        if (stopped)
            return Promise.reject(new Error('unavailable'));
        const promise = chain.then(work);
        chain = promise.catch(error => { /* Rejected validation does not poison the serialized queue. */ void error; });
        pending.add(promise);
        promise.then(() => pending.delete(promise), () => pending.delete(promise));
        return promise;
    }
    function persist(work) {
        return (async () => {
            try {
                return await work();
            }
            catch (error) {
                damaged = true;
                console.error('[learning-desk] persistence failed; restart before writing', error);
                throw new Error('writeUnknown');
            }
        })();
    }
    function validateData(raw) {
        const data = normalizeData(raw);
        data.settings = settingsSchema.parse(data.settings);
        for (const name of Object.keys(TABLES))
            data[name] = data[name].map(row => TABLES[name].valueSchema.parse(row));
        for (const card of data.cards)
            if (!data.decks.some(deck => deck.id === card.deckId))
                throw new Error('invalidImport');
        return data;
    }
    function finishTimer(now) {
        return (async () => {
            const timer = runtime.global.get().timer;
            if (!timer)
                return;
            const segments = [...timer.segments];
            if (timer.status === 'running')
                segments.push({ start: timer.resumedAt, end: timer.resumedAt + Math.max(0, elapsedMs(timer, now) - timer.accumulatedMs) });
            const byDay = new Map();
            for (const segment of segments) {
                let start = segment.start;
                while (start < segment.end) {
                    const next = new Date(start);
                    next.setHours(24, 0, 0, 0);
                    const end = Math.min(segment.end, next.getTime());
                    const key = localDate(start);
                    const previous = byDay.get(key) || { start, milliseconds: 0 };
                    previous.milliseconds += end - start;
                    byDay.set(key, previous);
                    start = end;
                }
            }
            for (const [day, value] of byDay)
                await domain.table('focus_records').put(`${timer.id}:${day}`, { id: `${timer.id}:${day}`, taskId: timer.taskId, courseId: timer.courseId, start: value.start, durationMin: value.milliseconds / 60000, mode: timer.mode, completed: true });
            await runtime.global.set({ ...runtime.global.get(), timer: null });
        })();
    }
    function settleTimer() {
        return (async () => {
            const timer = runtime.global.get().timer;
            if (timer && timer.status === 'running' && timer.mode !== 'countup' && elapsedMs(timer, clock()) >= timer.targetMs)
                await persist(() => finishTimer(clock()));
        })();
    }
    const service = {
        read() { return enqueue(async () => { if (damaged)
            throw new Error('writeUnknown'); await settleTimer(); return snapshot(); }); },
        command(raw) {
            return enqueue(async () => {
                if (damaged)
                    throw new Error('writeUnknown');
                const command = commandSchema.parse(raw);
                await settleTimer();
                if (command.type === 'put') {
                    const record = TABLES[command.table].valueSchema.parse(command.record);
                    if (command.table === 'courses' && record.start >= record.end)
                        throw new Error('invalidTime');
                    if (command.table === 'cards' && !domain.table('decks').get(record.deckId))
                        throw new Error('invalidForm');
                    const key = command.table === 'day_plans' ? record.date : record.id;
                    const stored = command.table === 'day_plans' ? { ...record, blocks: [] } : record;
                    await persist(() => domain.table(command.table).put(key, stored));
                }
                else if (command.type === 'review') {
                    const card = domain.table('cards').get(command.id);
                    if (!card)
                        throw new Error('invalidForm');
                    const count = snapshot().reviewCount;
                    if (count >= domain.global.get().reviewLimit)
                        throw new Error('reviewLimitReached');
                    const reviewed = reviewCard(card, command.grade, clock());
                    await persist(async () => { await domain.table('cards').put(card.id, reviewed); await runtime.global.set({ ...runtime.global.get(), review: { date: localDate(clock()), count: count + 1 } }); });
                }
                else if (command.type === 'delete') {
                    if (command.table === 'decks' && snapshot().cards.some(card => card.deckId === command.id))
                        throw new Error('deckNotEmpty');
                    await persist(() => domain.table(command.table).delete(command.id));
                }
                else if (command.type === 'settings')
                    await persist(() => domain.global.set(command.settings));
                else if (command.type === 'import') {
                    if (runtime.global.get().timer)
                        throw new Error('timerActive');
                    const data = validateData(command.data);
                    await persist(async () => {
                        for (const name of Object.keys(TABLES)) {
                            const table = domain.table(name);
                            for (const key of [...table.keys()])
                                await table.delete(key);
                            for (const row of data[name])
                                await table.put(name === 'day_plans' ? row.date : row.id, name === 'day_plans' ? { ...row, blocks: [] } : row);
                        }
                        await domain.global.set(data.settings);
                        await runtime.global.set({ ...runtime.global.get(), review: { date: localDate(clock()), count: 0 } });
                    });
                }
                else {
                    const now = clock();
                    const timer = runtime.global.get().timer;
                    if (command.action === 'finish') {
                        if (!timer)
                            throw new Error('timerMissing');
                        await persist(() => finishTimer(now));
                    }
                    else {
                        let next = transitionTimer(timer, command.action, now, { ...command, id: newId() });
                        if (next)
                            next = { ...next, segments: timer?.segments || [] };
                        if (command.action === 'pause' && timer.status === 'running')
                            next.segments = [...timer.segments, { start: timer.resumedAt, end: timer.resumedAt + Math.max(0, elapsedMs(timer, now) - timer.accumulatedMs) }];
                        await persist(() => runtime.global.set({ ...runtime.global.get(), timer: next }));
                    }
                }
                return snapshot();
            });
        },
        tool(name, raw, signal) {
            return (async () => {
                signal?.throwIfAborted();
                if (name === 'learning_desk_today') {
                    const data = await service.read();
                    return planFor(data, raw.date || localDate(clock()));
                }
                if (name === 'learning_desk_add_task') {
                    const task = createTask({ ...raw, id: newId(), date: raw.date || localDate(clock()) });
                    await service.command({ type: 'put', table: 'tasks', record: task });
                    return task;
                }
                if (name === 'learning_desk_plan_day') {
                    const date = raw.date || localDate(clock());
                    await service.command({ type: 'put', table: 'day_plans', record: { date, blocks: [], overrides: raw.overrides || [] } });
                    return planFor(await service.read(), date);
                }
                if (name === 'learning_desk_cards_from_note') {
                    const data = await service.read();
                    const note = data.notes.find(row => row.id === raw.noteId);
                    if (!note)
                        throw new Error('noteMissing');
                    if (!raw.cards)
                        return { note, instruction: 'Create question/answer pairs from this note and call the same tool with cards to save them.' };
                    const pairs = z.array(z.object({ front: z.string().min(1), back: z.string().min(1) })).min(1).max(100).parse(raw.cards);
                    let deck = data.decks.find(row => row.id === raw.deckId);
                    if (!deck) {
                        if (raw.deckId)
                            throw new Error('invalidForm');
                        deck = createDeck({ id: newId(), name: note.title || 'Note', description: note.id });
                        await service.command({ type: 'put', table: 'decks', record: deck });
                    }
                    const cards = [];
                    for (const pair of pairs) {
                        signal?.throwIfAborted();
                        const card = { ...initCard(pair.front, pair.back, deck.id, clock()), id: newId() };
                        await service.command({ type: 'put', table: 'cards', record: card });
                        cards.push(card);
                    }
                    return { noteId: note.id, deckId: deck.id, cards };
                }
                throw new Error('invalidForm');
            })();
        },
        close() { stopped = true; return Promise.allSettled([...pending]).then(() => Promise.all([domain.close(), runtime.close()])).then(() => { }); },
    };
    return service;
}
/** Public diagnostics exclude storage paths, stacks and private data.
 * @param {Error} error - Internal validation or storage failure.
 * @returns {object} Safe code and recovery message.
 */
export function publicFailure(error) {
    const codes = ['invalidImport', 'invalidForm', 'invalidTime', 'timerActive', 'timerMissing', 'noteMissing', 'deckNotEmpty', 'reviewLimitReached', 'writeUnknown', 'unavailable'];
    const code = codes.includes(error?.message) ? error.message : error instanceof z.ZodError ? 'invalidForm' : 'unavailable';
    return { ok: false, code, message: code === 'writeUnknown' ? 'Some writes may have committed. Export visible data and restart the host before editing.' : 'The operation failed. Check the input or reconnect to the Learning Desk host.' };
}
