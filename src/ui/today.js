/** Action-first day view driven by the frozen composer and actual focus records. */
import { createElement as h, useState } from 'react';
import { createTask } from '../domain/models.js';
import { streakDays } from '../domain/stats.js';
import { planFor, localDate, calendarRecords, addDays } from './data.js';
import { Button, EmptyState, ProgressRing, Modal, Field, Confirm } from './components.js';
import { TaskList } from './tasks.js';
import { RecordForm } from './forms.js';
/** Selected local day with recomputed timeline and goal progress.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Today({ data, store, t }) {
    const date = localDate(Date.now());
    const plan = planFor(data, date);
    const tasks = data.tasks.filter(row => row.date === date || (!row.date && row.status === 'todo'));
    const focus = data.focus_records.filter(row => row.mode !== 'break' && row.completed && localDate(row.start) === date).reduce((sum, row) => sum + row.durationMin, 0);
    const [quick, setQuick] = useState('');
    const [block, setBlock] = useState(null);
    const [editing, setEditing] = useState(null);
    const [reset, setReset] = useState(false);
    const [times, setTimes] = useState({ start: '08:00', end: '08:30' });
    const [error, setError] = useState(null);
    const overrides = data.day_plans.find(row => row.date === date)?.overrides || [];
    const saveOverride = (override) => store.command({ type: 'put', table: 'day_plans', record: { date, blocks: [], overrides: [...overrides.filter(row => row.refId !== override.refId), override] } });
    const notes = data.notes.filter(row => localDate(row.updatedAt) === date).slice(0, 3);
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return h('div', null, h('header', { className: 'ld-page-header' }, h('div', null, h('p', { className: 'ld-eyebrow' }, t('eyebrow')), h('h1', null, t('navToday')), h('p', { className: 'ld-muted' }, `${date} · ${t('day' + (now.getDay() || 7))}`)), h('div', { className: 'ld-progress' }, h(ProgressRing, { value: data.settings.dailyGoalMin ? focus / data.settings.dailyGoalMin : focus > 0 ? 1 : 0, label: t('percent') }, h('strong', null, Math.round(focus)), h('small', null, `${data.settings.dailyGoalMin} ${t('minutes')}`)), h('div', null, h('p', null, `${streakDays(calendarRecords(data.focus_records), date, data.settings.dailyGoalMin)} · ${t('streak')}`), h('p', { className: 'ld-muted' }, `${tasks.filter(row => row.status === 'done').length}/${tasks.length} · ${t('done')}`)))), h('p', { className: 'ld-muted' }, t('todayHint')), h('form', { className: 'ld-quick', onSubmit: async (event) => { event.preventDefault(); if (!quick.trim())
            return; const tags = [...quick.matchAll(/#([^\s#]+)/g)].map(match => match[1]); const title = quick.replace(/#[^\s#]+/g, '').trim(); if (!title)
            return; try {
            await store.command({ type: 'put', table: 'tasks', record: createTask({ id: crypto.randomUUID(), title, tags, date, order: data.tasks.length }) });
            setQuick('');
        }
        catch (caught) {
            void caught;
        } } }, h('input', { 'aria-label': t('quickAdd'), placeholder: t('quickAdd'), value: quick, onChange: event => setQuick(event.target.value) }), h(Button, { type: 'submit', primary: true, disabled: store.get().busy }, t('add'))), !data.settings.termStartDate && h('p', { className: 'ld-notice' }, t('termRequired')), h('div', { className: 'ld-grid-2' }, h('section', { className: 'ld-card' }, h('div', { className: 'ld-row' }, h('h2', null, t('timeline')), h('span', { className: 'ld-muted' }, `${plan.freeMinutes} ${t('free')}`)), h('p', { className: 'ld-now' }, `${t('now')} · ${time}`), plan.blocks.length ? plan.blocks.map(row => h('button', { type: 'button', key: row.id, className: `ld-block ld-marker-${row.kind === 'course' ? (data.courses.find(course => course.id === row.refId)?.color || '1') : '2'}`, onClick: () => { setBlock(row); setTimes({ start: row.start, end: row.end }); setError(null); } }, h('span', { className: 'ld-block-time' }, `${row.start}—${row.end}`), h('span', null, h('strong', null, row.title), row.kind === 'course' && h('small', null, `${row.location} · ${data.courses.find(course => course.id === row.refId)?.teacher || ''}`)))) : h(EmptyState, { t, hint: 'emptyToday', action: 'addTask', onAction: () => setEditing({ table: 'tasks' }) }), overrides.length > 0 && h(Button, { onClick: () => setReset(true) }, t('replan'))), h('section', { className: 'ld-card' }, h('div', { className: 'ld-row' }, h('h2', null, t('tasks')), h(Button, { onClick: () => setEditing({ table: 'tasks' }) }, t('addTask'))), tasks.length ? h(TaskList, { tasks, data, store, t }) : h(EmptyState, { t, hint: 'emptyTasks' }))), plan.overflow.length > 0 && h('section', { className: 'ld-card' }, h('h2', null, t('overflow')), plan.overflow.map(row => h('div', { key: row.id, className: 'ld-row' }, h('span', null, row.title), h(Button, { onClick: () => store.command({ type: 'put', table: 'tasks', record: { ...row, date: addDays(date, 1) } }).catch(caught => { void caught; }) }, t('tomorrow')), h(Button, { onClick: () => store.command({ type: 'put', table: 'tasks', record: { ...row, estimateMin: Math.max(15, Math.floor(row.estimateMin / 2)) } }).catch(caught => { void caught; }) }, t('halve'))))), notes.length > 0 && h('section', { className: 'ld-card' }, h('h2', null, t('todayNotes')), notes.map(note => h(Button, { key: note.id, onClick: () => setEditing({ table: 'notes', record: note }) }, note.title || note.markdown.slice(0, 48)))), editing && h(RecordForm, { ...editing, data, store, t, onClose: () => setEditing(null) }), block && h(Modal, { t, title: block.title, onClose: () => setBlock(null) }, h('form', { className: 'ld-form', onSubmit: async (event) => { event.preventDefault(); if (times.start >= times.end) {
            setError('invalidTime');
            return;
        } try {
            await saveOverride({ id: crypto.randomUUID(), type: 'move', refId: block.id, ...times });
            setBlock(null);
        }
        catch (caught) {
            setError(caught.message);
        } } }, h('p', null, `${block.start}—${block.end}`), h(Field, { label: t('start'), type: 'time', value: times.start, onChange: event => setTimes({ ...times, start: event.target.value }) }), h(Field, { label: t('end'), type: 'time', value: times.end, onChange: event => setTimes({ ...times, end: event.target.value }) }), error && h('p', { role: 'alert' }, t(error)), h('div', { className: 'ld-actions' }, h(Button, { type: 'submit', primary: true, disabled: store.get().busy }, t('moveBlock')), h(Button, { disabled: store.get().busy, onClick: async () => { try {
            await saveOverride({ id: crypto.randomUUID(), type: 'remove', refId: block.id });
            setBlock(null);
        }
        catch (caught) {
            setError(caught.message);
        } } }, t('removeBlock')), block.kind !== 'custom' && h(Button, { onClick: () => { const table = block.kind === 'task' ? 'tasks' : 'courses'; setEditing({ table, record: data[table].find(row => row.id === block.refId) }); setBlock(null); } }, t('edit'))))), reset && h(Confirm, { t, message: 'resetPlanConfirm', onClose: () => setReset(false), action: () => store.command({ type: 'put', table: 'day_plans', record: { date, blocks: [], overrides: [] } }) }));
}
