/** Editable task rows keep task and subtask completion independent. */
import { createElement as h, useState } from 'react';
import { Button, Checkbox, Tag, Confirm } from './components.js';
import { RecordForm } from './forms.js';
import { addDays, localDate } from './data.js';
/** Controlled task/subtask completion and record actions.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function TaskList({ tasks, data, store, t }) {
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const update = (task, patch) => store.command({ type: 'put', table: 'tasks', record: { ...task, ...patch } }).catch(error => { void error; });
    return h('div', { className: 'ld-task-list' }, tasks.map(task => h('article', { key: task.id, className: 'ld-task' }, h('div', { className: 'ld-row' }, h(Checkbox, { checked: task.status === 'done', label: task.title, onChange: done => update(task, { status: done ? 'done' : 'todo' }) }), h('span', { className: 'ld-muted' }, `${task.estimateMin} ${t('minutes')}`)), h('div', { className: 'ld-row' }, h(Tag, null, t(task.priority)), h('span', { className: 'ld-muted' }, task.date || t('overflow')), task.tags.map(tag => h(Tag, { key: tag }, tag))), task.subtasks.map(subtask => h(Checkbox, { key: subtask.id, checked: subtask.done, label: subtask.title, onChange: done => update(task, { subtasks: task.subtasks.map(row => row.id === subtask.id ? { ...row, done } : row) }) })), h('div', { className: 'ld-actions' }, h(Button, { onClick: () => setEditing(task) }, t('edit')), h(Button, { onClick: () => update(task, { date: addDays(task.date || localDate(Date.now()), 1) }) }, t('tomorrow')), h(Button, { onClick: () => setDeleting(task) }, t('delete'))))), editing && h(RecordForm, { table: 'tasks', record: editing, data, store, t, onClose: () => setEditing(null) }), deleting && h(Confirm, { t, message: 'confirmDelete', onClose: () => setDeleting(null), action: () => store.command({ type: 'delete', table: 'tasks', id: deleting.id }, 'deleted') }));
}
