/** UI of the Host-owned timer. Wall-clock projections never write on every tick. */
import { createElement as h, useState, useEffect } from 'react';
import { elapsedMs } from './timer.js';
import { Button, Field, Select, Confirm } from './components.js';
/** Host timer projection and start/pause/resume/finish controls.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Focus({ data, store, t }) {
    const [mode, setMode] = useState('pomodoro');
    const [minutes, setMinutes] = useState(data.settings.pomodoroMin);
    const [taskId, setTaskId] = useState('');
    const [confirm, setConfirm] = useState(false);
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
    const timer = data.timer;
    useEffect(() => { if (!timer)
        setMinutes(mode === 'break' ? Math.max(1, data.settings.breakMin) : data.settings.pomodoroMin); }, [data.settings.pomodoroMin, data.settings.breakMin, mode]);
    useEffect(() => { if (timer && timer.mode !== 'countup' && elapsedMs(timer, now) >= timer.targetMs)
        void store.refresh(); }, [timer, now, store]);
    const seconds = Math.floor((timer ? (timer.mode === 'countup' ? elapsedMs(timer, now) : timer.targetMs - elapsedMs(timer, now)) : Number(minutes) * 60000) / 1000);
    const display = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const command = (action) => store.command({ type: 'timer', action, minutes: Number(minutes), mode, taskId: taskId || null, courseId: data.tasks.find(row => row.id === taskId)?.courseId || null }).catch(error => { void error; });
    return h('section', { className: 'ld-card ld-focus', 'aria-label': t('focus') }, h('div', { className: 'ld-row' }, h('h2', null, t('focus')), timer && h('span', { className: 'ld-tag' }, t(timer.status))), h('div', { className: 'ld-clock', 'aria-live': 'off' }, display), h('p', { className: 'ld-muted' }, t('focusHint')), !timer && h('div', { className: 'ld-grid-2' }, h(Select, { label: t('kind'), value: mode, onChange: event => { setMode(event.target.value); setMinutes(event.target.value === 'break' ? Math.max(1, data.settings.breakMin) : data.settings.pomodoroMin); } }, ['pomodoro', 'countup', 'break'].map(value => h('option', { key: value, value }, t(value)))), h(Field, { label: t('minutes'), type: 'number', min: 1, max: 1440, value: minutes, onChange: event => setMinutes(event.target.value) }), h(Select, { label: t('task'), value: taskId, onChange: event => setTaskId(event.target.value) }, h('option', { value: '' }, t('none')), data.tasks.filter(row => row.status !== 'done').map(row => h('option', { key: row.id, value: row.id }, row.title)))), h('div', { className: 'ld-actions' }, !timer ? h(Button, { primary: true, disabled: store.get().busy, onClick: () => command('start') }, t('startFocus')) : h(Button, { primary: true, disabled: store.get().busy, onClick: () => command(timer.status === 'running' ? 'pause' : 'resume') }, t(timer.status === 'running' ? 'pause' : 'resume')), timer && h(Button, { disabled: store.get().busy, onClick: () => command('finish') }, t('finish')), timer && h(Button, { onClick: () => setConfirm(true) }, t('reset'))), confirm && h(Confirm, { t, message: 'resetTimerConfirm', onClose: () => setConfirm(false), action: () => store.command({ type: 'timer', action: 'reset' }) }));
}
