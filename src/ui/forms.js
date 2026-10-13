/** Entity editors share validation, labels and safe async submission. */
import { createElement as h, useState } from 'react';
import { createCourse, createTask, createNote, createResource, createDeck } from '../domain/models.js';
import { initCard } from '../domain/srs.js';
import { localDate } from './data.js';
import { Button, Modal, Field, Select } from './components.js';
const fields = {
    courses: [['name', 'text'], ['teacher', 'text'], ['location', 'text'], ['weekday', 'weekday'], ['start', 'time'], ['end', 'time'], ['fromWeek', 'number'], ['toWeek', 'number'], ['parity', ['all', 'odd', 'even']], ['color', ['1', '2', '3', '4', '5', '6']], ['note', 'textarea']],
    tasks: [['title', 'text'], ['date', 'date'], ['estimateMin', 'number'], ['priority', ['low', 'medium', 'high']], ['status', ['todo', 'doing', 'done']], ['courseId', 'course'], ['tags', 'text'], ['subtasks', 'textarea']],
    notes: [['title', 'text'], ['markdown', 'textarea'], ['tags', 'text'], ['linkTaskIds', 'tasks'], ['linkCourseIds', 'courses']],
    resources: [['title', 'text'], ['url', 'url'], ['kind', ['link', 'book', 'course', 'video']], ['tags', 'text'], ['status', ['unread', 'reading', 'done']], ['progress', 'number'], ['note', 'textarea']],
    cards: [['deckId', 'deck'], ['newDeck', 'text'], ['front', 'textarea'], ['back', 'textarea']],
};
const labels = { courseId: 'course', deckId: 'deck', linkTaskIds: 'linkedTasks', linkCourseIds: 'linkedCourses' };
const creators = { courses: createCourse, tasks: createTask, notes: createNote, resources: createResource };
/** Validated record editor that retains input after failed writes.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function RecordForm({ table, record, seed, data, store, t, onClose }) {
    const [value, setValue] = useState(() => ({
        id: crypto.randomUUID(), name: '', title: '', teacher: '', location: '', weekday: 1, start: '08:00', end: '09:30', fromWeek: 1, toWeek: 16, parity: 'all', color: '1', note: '', date: localDate(Date.now()), estimateMin: 25, priority: 'medium', status: table === 'resources' ? 'unread' : 'todo', courseId: '', deckId: data.decks[0]?.id || '', newDeck: '', front: '', back: '', url: '', kind: 'link', progress: 0, markdown: '', linkTaskIds: [], linkCourseIds: [],
        ...seed, ...record, tags: (record?.tags || []).join(', '), subtasks: (record?.subtasks || []).map(row => row.title).join('\n'), fromWeek: record?.weeks?.from || 1, toWeek: record?.weeks?.to || 16, parity: record?.weeks?.parity || 'all', progress: (record?.progress || 0) * 100,
    }));
    const [error, setError] = useState(null);
    const [pending, setPending] = useState(false);
    const overlap = table === 'courses' && data.courses.some(row => row.id !== value.id && row.weekday === Number(value.weekday) && row.start < value.end && row.end > value.start && row.weeks.from <= Number(value.toWeek) && row.weeks.to >= Number(value.fromWeek) && (row.weeks.parity === 'all' || value.parity === 'all' || row.weeks.parity === value.parity));
    const submit = async (event) => {
        event.preventDefault();
        setError(null);
        setPending(true);
        try {
            let result;
            if (table === 'courses') {
                if (value.start >= value.end)
                    throw new Error('invalidTime');
                result = createCourse({ ...value, weekday: Number(value.weekday), weeks: { from: Number(value.fromWeek), to: Number(value.toWeek), parity: value.parity } });
            }
            else if (table === 'tasks')
                result = createTask({ ...value, courseId: value.courseId || null, date: value.date || null, estimateMin: Number(value.estimateMin), tags: value.tags.split(/[,，]/).map(x => x.trim()).filter(Boolean), subtasks: value.subtasks.split('\n').map(x => x.trim()).filter(Boolean).map((title, index) => { const old = record?.subtasks?.find(row => row.title === title); return old || { id: `${value.id}:s${index}:${crypto.randomUUID()}`, title, done: false }; }) });
            else if (table === 'notes')
                result = createNote({ ...value, createdAt: record?.createdAt || Date.now(), updatedAt: Date.now(), tags: value.tags.split(/[,，]/).map(x => x.trim()).filter(Boolean) });
            else if (table === 'resources')
                result = createResource({ ...value, progress: Number(value.progress) / 100, tags: value.tags.split(/[,，]/).map(x => x.trim()).filter(Boolean) });
            else {
                let deckId = value.deckId;
                if (value.newDeck.trim()) {
                    const deck = createDeck({ id: crypto.randomUUID(), name: value.newDeck.trim() });
                    await store.command({ type: 'put', table: 'decks', record: deck });
                    deckId = deck.id;
                }
                if (!deckId || !value.front.trim() || !value.back.trim())
                    throw new Error('invalidForm');
                result = record ? { ...record, deckId, front: value.front, back: value.back } : { ...initCard(value.front, value.back, deckId, Date.now()), id: value.id };
            }
            await store.command({ type: 'put', table, record: result });
            onClose();
        }
        catch (caught) {
            setError(['invalidTime', 'timerActive', 'writeUnknown', 'unavailable'].includes(caught.message) ? caught.message : 'invalidForm');
            setPending(false);
        }
    };
    return h(Modal, { t, title: t(record ? 'edit' : ({ courses: 'addCourse', tasks: 'addTask', notes: 'addNote', resources: 'addResource', cards: 'addCard' })[table]), onClose }, h('form', { onSubmit: submit, className: 'ld-form' }, fields[table].map(([key, type]) => {
        const props = { key, label: t(labels[key] || key), value: value[key] ?? '', disabled: pending, onChange: event => setValue({ ...value, [key]: type === 'tasks' || type === 'courses' ? [...event.target.selectedOptions].map(option => option.value) : event.target.value }) };
        if (Array.isArray(type))
            return h(Select, props, type.map(option => h('option', { value: option, key: option }, key === 'color' ? option : t(option))));
        if (['weekday', 'course', 'deck', 'tasks', 'courses'].includes(type)) {
            const rows = type === 'weekday' ? Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: t('day' + (i + 1)) })) : data[type === 'course' ? 'courses' : type === 'deck' ? 'decks' : type];
            return h(Select, { ...props, multiple: type === 'tasks' || type === 'courses' }, !['weekday', 'tasks', 'courses'].includes(type) && h('option', { value: '' }, t('none')), rows.map(row => h('option', { key: row.id, value: row.id }, row.name || row.title)));
        }
        return h(Field, { ...props, type: type === 'textarea' ? 'text' : type, multiline: type === 'textarea', rows: type === 'textarea' ? 5 : undefined, min: type === 'number' ? 0 : undefined, max: key === 'progress' ? 100 : undefined, required: ['name', 'title', 'start', 'end'].includes(key) && !(key === 'title' && table === 'notes') });
    }), overlap && h('p', { className: 'ld-notice', role: 'status' }, t('overlap')), error && h('p', { role: 'alert', className: 'ld-error' }, t(error)), h('div', { className: 'ld-actions' }, h(Button, { onClick: onClose, disabled: pending }, t('cancel')), h(Button, { type: 'submit', primary: true, disabled: pending || store.get().busy }, t('save')))));
}
