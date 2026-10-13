/** Four registry-ready tools with explicit JSON input/output and pure GUI presenters. */
import { publicFailure } from './service.js';
const date = { type: 'string', description: 'Local calendar day YYYY-MM-DD; omitted means today.' };
const override = { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, type: { type: 'string', enum: ['remove', 'move', 'add'] }, refId: { type: 'string' }, title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' } }, required: ['id', 'type'] };
/** Registry-ready tools validate tool JSON in the shared service.
 * @param {object} desk - Shared Host desk service.
 * @returns {object[]} Four definitions with canonical outputs and pure presenters.
 */
export function deskTools(desk) {
    const specs = [
        ['learning_desk_today', 'Read the Learning Desk timetable, scheduled tasks and overflow for a day.', { date }],
        ['learning_desk_plan_day', 'Replace explicit day overrides and recompute the plan. Read today first; moves need refId plus start/end. An empty overrides array restores automatic scheduling.', { date, overrides: { type: 'array', items: override } }],
        ['learning_desk_add_task', 'Add one task to the same Learning Desk data shown in the UI.', { title: { type: 'string' }, date, estimateMin: { type: 'number' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] }, tags: { type: 'array', items: { type: 'string' } } }],
        ['learning_desk_cards_from_note', 'Omit cards to read the note first. Then supply question/answer pairs grounded in that note. Saves cards with SM-2 initial state, creating a deck when deckId is omitted.', { noteId: { type: 'string' }, deckId: { type: 'string' }, cards: { type: 'array', items: { type: 'object', properties: { front: { type: 'string' }, back: { type: 'string' } }, required: ['front', 'back'], additionalProperties: false } } }],
    ];
    return specs.map(([name, description, properties]) => ({
        name, description,
        parameters: { type: 'object', properties, required: name.endsWith('add_task') ? ['title'] : name.endsWith('cards_from_note') ? ['noteId'] : [], additionalProperties: false },
        output: { schema: { type: 'object', properties: { ok: { type: 'boolean' }, text: { type: 'string' } }, required: ['ok', 'text'], additionalProperties: false }, render: (args, value) => [{ type: 'text', text: value.text }] },
        execute: async (args, exec) => {
            try {
                return { ok: true, text: JSON.stringify(await desk.tool(name, args, exec.signal), null, 2) };
            }
            catch (error) {
                exec.signal?.throwIfAborted();
                return { ok: false, text: JSON.stringify(publicFailure(error)) };
            }
        },
        presentCall: args => ({ card: 'generic', title: name, kind: name.endsWith('today') ? 'read' : 'edit', rawInput: args }),
    }));
}
