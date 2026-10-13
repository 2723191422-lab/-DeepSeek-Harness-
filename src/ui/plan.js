/** Week timetable and paste import, with explicit preview and batch undo. */
import { createElement as h, useState } from 'react';
import { parseScheduleText } from '../domain/import-parser.js';
import { courseOccursOn, weekIndex } from '../domain/term-weeks.js';
import { localDate, addDays } from './data.js';
import { Button, EmptyState, Modal, Field, Confirm } from './components.js';
import { RecordForm } from './forms.js';
import { TaskList } from './tasks.js';
/** Weekly timetable, paste preview and grouped task editing.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Plan({ data, store, t }) {
    const today = localDate(Date.now());
    const [anchor, setAnchor] = useState(today);
    const offset = (new Date(`${anchor}T12:00:00`).getDay() + 7 - data.settings.weekStartsOn) % 7;
    const first = addDays(anchor, -offset);
    const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
    const [edit, setEdit] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [paste, setPaste] = useState(null);
    const [preview, setPreview] = useState(null);
    const [batch, setBatch] = useState([]);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('');
    const grouped = Object.groupBy(data.tasks.filter(row => row.title.toLowerCase().includes(filter.toLowerCase())), row => row.date || '');
    return h('div', null, h('header', { className: 'ld-page-header' }, h('div', null, h('p', { className: 'ld-eyebrow' }, t('eyebrow')), h('h1', null, t('navPlan')), h('p', { className: 'ld-muted' }, t('planHint'))), h('div', { className: 'ld-actions' }, h(Button, { onClick: () => setEdit({ table: 'tasks' }) }, t('addTask')), h(Button, { primary: true, onClick: () => setEdit({ table: 'courses' }) }, t('addCourse')))), h('section', { className: 'ld-card' }, h('div', { className: 'ld-row' }, h('h2', null, t('courses')), h('div', { className: 'ld-actions' }, h(Button, { onClick: () => setAnchor(addDays(anchor, -7)) }, t('previous')), h('span', null, `${first} — ${days[6]}`), h(Button, { onClick: () => setAnchor(addDays(anchor, 7)) }, t('next')))), !data.settings.termStartDate && h('p', { className: 'ld-notice' }, t('termRequired')), data.settings.termStartDate && h('p', { className: 'ld-muted' }, `${t('week')} ${weekIndex(first, data.settings.termStartDate)}`), h('div', { className: 'ld-week-grid' }, days.map(day => { const weekday = new Date(`${day}T12:00:00`).getDay() || 7; const courses = data.settings.termStartDate ? data.courses.filter(row => courseOccursOn(row, day, data.settings.termStartDate)) : []; return h('section', { key: day, className: 'ld-week-day' }, h('h3', null, t('day' + weekday)), h('small', { className: 'ld-muted' }, day.slice(5)), h('div', { className: 'ld-week-hours' }, Array.from({ length: 14 }, (_, i) => h('button', { type: 'button', key: i, className: 'ld-week-hour', 'aria-label': `${t('addCourse')} · ${day} · ${i + 8}:00`, onClick: () => setEdit({ table: 'courses', record: { weekday, start: `${String(i + 8).padStart(2, '0')}:00`, end: `${String(i + 9).padStart(2, '0')}:00` }, newRecord: true }) }, h('small', null, `${i + 8}:00`))), courses.map(row => h('button', { type: 'button', key: row.id, className: `ld-week-course ld-marker-${row.color || '1'}`, style: { top: `${Math.max(0, (Number(row.start.slice(0, 2)) * 60 + Number(row.start.slice(3)) - 480) / 840 * 100)}%`, height: `${Math.max(7, (Number(row.end.slice(0, 2)) * 60 + Number(row.end.slice(3)) - Number(row.start.slice(0, 2)) * 60 - Number(row.start.slice(3))) / 840 * 100)}%` }, onClick: () => setEdit({ table: 'courses', record: row }) }, h('strong', null, row.name), h('small', null, `${row.start}—${row.end}`), h('small', null, row.location))))); })), h('div', { className: 'ld-actions' }, h(Button, { onClick: () => { setPaste(''); setPreview(null); setError(null); } }, t('paste')), batch.length > 0 && h(Button, { disabled: pending, onClick: async () => { setPending(true); try {
            for (const id of batch)
                await store.command({ type: 'delete', table: 'courses', id }, null);
            setBatch([]);
            store.toast('undone');
        }
        catch (caught) {
            void caught;
        }
        finally {
            setPending(false);
        } } }, t('undo')))), data.courses.length > 0 && h('section', { className: 'ld-card' }, data.courses.map(row => h('div', { className: 'ld-row', key: row.id }, h('span', null, `${row.name} · ${t('day' + row.weekday)} ${row.start}—${row.end} · ${row.weeks.from}–${row.weeks.to} ${t('week')} · ${t(row.weeks.parity)}`), h('div', { className: 'ld-actions' }, h(Button, { onClick: () => setEdit({ table: 'courses', record: row }) }, t('edit')), h(Button, { onClick: () => setDeleting(row) }, t('delete')))))), h('section', { className: 'ld-card' }, h('div', { className: 'ld-row' }, h('h2', null, t('tasks')), h(Field, { label: t('search'), type: 'search', value: filter, onChange: event => setFilter(event.target.value) })), data.tasks.length ? Object.keys(grouped).sort().map(date => h('div', { key: date }, h('h3', null, date || t('overflow')), h(TaskList, { tasks: grouped[date], data, store, t }))) : h(EmptyState, { t, hint: 'emptyTasks', action: 'addTask', onAction: () => setEdit({ table: 'tasks' }) })), edit && h(RecordForm, { ...edit, record: edit.newRecord ? { ...edit.record, id: crypto.randomUUID(), name: '' } : edit.record, data, store, t, onClose: () => setEdit(null) }), deleting && h(Confirm, { t, message: 'confirmDelete', onClose: () => setDeleting(null), action: () => store.command({ type: 'delete', table: 'courses', id: deleting.id }, 'deleted') }), paste !== null && h(Modal, { t, title: t('paste'), onClose: () => { if (!pending)
            setPaste(null); } }, h('div', { className: 'ld-form' }, h('p', { className: 'ld-muted' }, t('pasteHint')), h(Field, { label: t('paste'), multiline: true, rows: 8, value: paste, disabled: pending, onChange: event => { setPaste(event.target.value); setPreview(null); } }), h(Button, { onClick: () => setPreview(parseScheduleText(paste)), disabled: pending }, t('preview')), preview && h('div', null, preview.courses.map(row => h('p', { key: row.id }, `${row.name} · ${t('day' + row.weekday)} ${row.start}—${row.end} · ${row.weeks.from}–${row.weeks.to}`)), preview.errors.map(row => h('p', { key: row.line, role: 'alert', className: 'ld-error' }, `${t('line')} ${row.line}: ${row.raw} — ${t('parseError')}`)), h(Button, { primary: true, disabled: pending || !preview.courses.length, onClick: async () => { setPending(true); const ids = []; try {
            for (const row of preview.courses) {
                const course = { ...row, id: crypto.randomUUID() };
                await store.command({ type: 'put', table: 'courses', record: course }, null);
                ids.push(course.id);
            }
            store.toast('imported');
            setPaste(null);
        }
        catch (caught) {
            setError(caught.message);
        }
        finally {
            setBatch(ids);
            setPending(false);
        } } }, t('import'))), error && h('p', { role: 'alert' }, t(error)))));
}
