/** Settings and portable backups; replacement import and clear require explicit confirmation. */
import { createElement as h, useState } from 'react';
import { createSettings } from '../domain/models.js';
import { emptyData, normalizeData, TABLE_NAMES } from './data.js';
import { downloadJson } from './store.js';
import { Button, Field, Select, Confirm } from './components.js';
/** Learning parameters and explicit JSON backup replacement.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Settings({ data, store, t }) {
    const [value, setValue] = useState({ ...data.settings });
    const [text, setText] = useState('');
    const [error, setError] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const exportData = () => downloadJson({ ...data, timer: undefined });
    return h('div', null, h('header', { className: 'ld-page-header' }, h('div', null, h('p', { className: 'ld-eyebrow' }, t('eyebrow')), h('h1', null, t('navSettings')), h('p', { className: 'ld-muted' }, t('settingsHint')))), h('section', { className: 'ld-card' }, h('form', { className: 'ld-form', onSubmit: async (event) => { event.preventDefault(); try {
            await store.command({ type: 'settings', settings: createSettings({ ...value, termStartDate: value.termStartDate || null }) });
            setError(null);
        }
        catch (caught) {
            setError('invalidForm');
        } } }, h('div', { className: 'ld-grid-2' }, ['dailyGoalMin', 'pomodoroMin', 'breakMin', 'reviewLimit'].map(key => h(Field, { key, label: t(key), type: 'number', min: key === 'pomodoroMin' || key === 'reviewLimit' ? 1 : 0, max: 1440, step: 1, required: true, value: value[key], onChange: event => setValue({ ...value, [key]: Number(event.target.value) }) })), h(Field, { label: t('termStartDate'), type: 'date', value: value.termStartDate || '', onChange: event => setValue({ ...value, termStartDate: event.target.value }) }), h(Select, { label: t('weekStartsOn'), value: value.weekStartsOn, onChange: event => setValue({ ...value, weekStartsOn: Number(event.target.value) }) }, Array.from({ length: 7 }, (_, i) => h('option', { key: i, value: i + 1 }, t('day' + (i + 1)))))), h(Button, { type: 'submit', primary: true, disabled: store.get().busy }, t('save')))), h('section', { className: 'ld-card' }, h('h2', null, t('data')), h('p', { className: 'ld-muted' }, t('dataHint')), h(Button, { onClick: exportData }, t('export')), h(Field, { label: t('importJson'), multiline: true, rows: 6, value: text, onChange: event => setText(event.target.value) }), h('div', { className: 'ld-actions' }, h(Button, { disabled: store.get().busy, onClick: () => { try {
            const imported = normalizeData(JSON.parse(text));
            setConfirm({ message: 'importConfirm', data: imported });
            setError(null);
        }
        catch (caught) {
            setError('invalidImport');
        } } }, t('importJson')), h(Button, { disabled: store.get().busy, onClick: () => setConfirm({ message: 'clearConfirm', data: emptyData() }) }, t('clear'))), error && h('p', { role: 'alert', className: 'ld-error' }, t(error))), h('p', { className: 'ld-muted' }, t('about')), confirm && h(Confirm, { t, message: confirm.message, onClose: () => setConfirm(null), action: async () => { const result = await store.command({ type: 'import', data: confirm.data }, 'imported'); setValue(result.settings); setText(''); } }));
}
