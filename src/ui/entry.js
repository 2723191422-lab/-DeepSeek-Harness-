/** Browser plugin activation: locale and owner-scoped slots; one cache per plugin lifetime. */
import { createElement as h, useState, useEffect } from 'react';
import { NS, zh, en } from './i18n.js';
import { CSS } from './styles.js';
import { createStore, downloadJson } from './store.js';
import { ErrorBoundary, Button } from './components.js';
import { Today } from './today.js';
import { Plan } from './plan.js';
import { Knowledge } from './knowledge.js';
import { Stats } from './stats.js';
import { Settings } from './settings.js';
import { Focus } from './focus.js';
/** Stable sidebar/main contribution identifier. */
export const PANEL_ID = 'learning-desk';
/** Slot and locale services required by the browser module. */
export const inject = ['slots', 'locale'];
const NAV = ['today', 'plan', 'knowledge', 'stats', 'settings'];
const labels = ['navToday', 'navPlan', 'navKnowledge', 'navStats', 'navSettings'];
/** Host-theme sidebar book icon.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Icon(props) {
    const size = typeof props.size === 'number' ? props.size : 20;
    return h('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, focusable: false, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M12 6.75v11.5' }), h('path', { d: 'M12 7.25C9.75 5.5 7 5 4 5.4v11c3-.4 5.75.1 8 1.85' }), h('path', { d: 'M12 7.25C14.25 5.5 17 5 20 5.4v11c-3-.4-5.75.1-8 1.85' }));
}
/** Register locale, slots and a disposable Host cache.
 * @param {object} ctx - Browser Cordis context with locale and slots.
 * @returns {void} Contributions and cleanup are owned by effects.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'learning-desk: dictionaries');
    const t = ctx.locale.bind(NS);
    let storage;
    try {
        storage = window.localStorage;
    }
    catch (error) {
        console.warn('[learning-desk] legacy browser storage unavailable', error);
    }
    const store = createStore({ storage });
    ctx.effect(() => { void store.initialize(); return () => store.dispose(); }, 'learning-desk: client data');
    function Panel() {
        const [state, setState] = useState(store.get());
        const [section, setSection] = useState('today');
        const [, setLocale] = useState(0);
        useEffect(() => store.subscribe(() => setState(store.get())), []);
        useEffect(() => ctx.locale.subscribe(() => setLocale(value => value + 1)), []);
        const props = { data: state.data, store, t };
        const View = { today: Today, plan: Plan, knowledge: Knowledge, stats: Stats, settings: Settings }[section];
        return h('div', { className: 'ld-root' }, h('style', null, CSS), h('nav', { className: 'ld-nav', 'aria-label': t('navLabel') }, h('div', { className: 'ld-nav-title' }, h(Icon, {}), h('span', null, t('panel'))), NAV.map((id, index) => h('button', { type: 'button', className: 'ld-nav-item', key: id, title: t(labels[index]), 'aria-label': t(labels[index]), 'aria-current': section === id ? 'page' : undefined, onClick: () => setSection(id) }, h('span', { className: 'ld-nav-index', 'aria-hidden': true }, String(index + 1).padStart(2, '0')), h('span', { className: 'ld-nav-text' }, t(labels[index]))))), h('main', { className: 'ld-main' }, h('div', { className: 'ld-content' }, state.error && h('div', { className: 'ld-error', role: 'alert' }, h('p', null, t(state.error)), h(Button, { onClick: () => store.refresh() }, t('retry'))), state.legacy && h('div', { className: 'ld-notice', role: 'status' }, h('p', null, t(state.legacy.valid ? 'legacyFound' : 'legacyCorrupt')), h(Button, { onClick: () => downloadJson(state.legacy.raw, 'learning-desk-legacy.json') }, t('exportLegacy'))), state.loading ? h('div', { className: 'ld-loading', role: 'status' }, t('loading')) : h('div', null, h('fieldset', { className: 'ld-view-fieldset', disabled: state.busy || !!state.error }, h(ErrorBoundary, { t, key: section }, h(View, { ...props, onFocus: () => setSection('today') }))), h(ErrorBoundary, { t }, h(Focus, props))))), h('div', { className: 'ld-toast-host' }, state.notices.map(row => h('div', { className: 'ld-toast', role: row.error ? 'alert' : 'status', key: row.id }, t(row.key)))));
    }
    function PanelEntry() { return h('div', { className: 'ld-shell' }, h(ErrorBoundary, { t }, h(Panel, {}))); }
    function IconEntry(props) { return h(ErrorBoundary, { t }, h(Icon, props)); }
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 1, label: () => t('panel'), locale: NS }, IconEntry));
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, PanelEntry));
}
