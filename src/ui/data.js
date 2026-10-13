/** Shared record normalization and calendar adapters; no storage or clock access. */
import { createCourse, createTask, createNote, createResource, createDeck, createFocusRecord, createSettings } from '../domain/models.js';
import { composeDayPlan } from '../domain/schedule.js';
import { initCard } from '../domain/srs.js';
/** Tables carried by a version-1 JSON backup. */
export const TABLE_NAMES = ['courses', 'tasks', 'notes', 'resources', 'decks', 'cards', 'focus_records', 'day_plans'];
/** Existing record creators for form and import normalization. */
export const CREATORS = { courses: createCourse, tasks: createTask, notes: createNote, resources: createResource, decks: createDeck, focus_records: createFocusRecord };
/** Local calendar date for a timestamp. @param {number} ms timestamp @returns {string} ISO date */
export function localDate(ms) {
    const date = new Date(ms);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
/** Add calendar days without DST elapsed-time arithmetic.
 * @param {string} date - Local ISO calendar day.
 * @param {number} days - Signed number of calendar days.
 * @returns {string} Shifted ISO day.
 */
export function addDays(date, days) { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return localDate(value.getTime()); }
/** Empty export envelope. @returns {object} independent defaults */
export function emptyData() { return { version: 1, ...Object.fromEntries(TABLE_NAMES.map(name => [name, []])), settings: createSettings() }; }
/** Normalize the portable envelope; Host table schemas perform final record validation.
 * @param {object} raw - Parsed version-1 backup.
 * @returns {object} Learning tables and settings with duplicate identifiers rejected.
 */
export function normalizeData(raw) {
    if (!raw || raw.version !== 1)
        throw new Error('invalidImport');
    const data = emptyData();
    data.settings = createSettings(raw.settings || {});
    for (const name of TABLE_NAMES) {
        if (raw[name] === undefined)
            continue;
        if (!Array.isArray(raw[name]))
            throw new Error('invalidImport');
        data[name] = raw[name].map(row => {
            if (CREATORS[name])
                return CREATORS[name](row);
            if (name === 'cards')
                return { ...initCard(row.front, row.back, row.deckId, row.due), ...row };
            return row;
        });
        const ids = data[name].map(row => name === 'day_plans' ? row.date : row.id);
        if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length)
            throw new Error('invalidImport');
    }
    return data;
}
/** Compose the selected date using only persisted explicit overrides.
 * @param {object} data - Learning tables and settings.
 * @param {string} date - Selected local ISO day.
 * @returns {object} Fixed, scheduled and overflow blocks with sorted timeline blocks.
 */
export function planFor(data, date) {
    const overrides = data.day_plans.find(row => row.date === date)?.overrides || [];
    const plan = composeDayPlan({ dateStr: date, dayStart: '08:00', dayEnd: '22:00', courses: data.settings.termStartDate ? data.courses : [], tasks: data.tasks, overrides, termStartDateStr: data.settings.termStartDate || date });
    return { ...plan, blocks: [...plan.fixed, ...plan.scheduled].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin) };
}
/** Shift local-day timestamps to UTC for the frozen UTC aggregation algorithms.
 * @param {object[]} records - Persisted focus records.
 * @returns {object[]} Non-break records with UTC day anchors.
 */
export function calendarRecords(records) {
    return records.filter(row => row.mode !== 'break').map(row => ({ ...row, start: Date.parse(`${localDate(row.start)}T00:00:00Z`) }));
}
/** Safe external resource link; rejects executable and non-web schemes.
 * @param {string} url - User-entered resource URL.
 * @returns {string|null} HTTP(S) URL or null when unusable.
 */
export function safeLink(url) { try {
    const value = new URL(url);
    return ['https:', 'http:'].includes(value.protocol) ? value.href : null;
}
catch (error) {
    return null;
} }
