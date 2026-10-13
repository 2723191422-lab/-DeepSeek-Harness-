/** Accessible local primitives, using only the host's React and semantic CSS tokens. */
import { createElement as h, Component, useEffect, useRef, useState } from 'react';
/** Native action button with optional primary styling.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Button({ children, primary, ...props }) { return h('button', { type: 'button', className: primary ? 'ld-button ld-primary' : 'ld-button', ...props }, children); }
/** Labeled controlled checkbox with a 44px click target.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Checkbox({ checked, onChange, label }) { return h('label', { className: 'ld-check' }, h('input', { type: 'checkbox', checked, onChange: event => onChange(event.target.checked), 'aria-label': label }), h('span', null, label)); }
/** Non-interactive token for user tags and relations.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Tag({ children }) { return h('span', { className: 'ld-tag' }, children); }
/** Localized next action for an empty section.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function EmptyState({ t, hint, action, onAction }) { return h('div', { className: 'ld-empty' }, h('span', { className: 'ld-empty-icon', 'aria-hidden': true }, '↗'), h('h3', null, t('emptyTitle')), h('p', null, t(hint)), action && h(Button, { primary: true, onClick: onAction }, t(action))); }
/** Clamped progress with a textual percentage alternative.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function ProgressRing({ value, label, children }) {
    const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
    return h('div', { className: 'ld-ring', role: 'img', 'aria-label': `${label} ${percent}%` }, h('svg', { viewBox: '0 0 100 100', 'aria-hidden': true }, h('circle', { cx: 50, cy: 50, r: 43, className: 'ld-ring-base' }), h('circle', { cx: 50, cy: 50, r: 43, className: 'ld-ring-value', strokeDasharray: `${percent * 2.702} 270.2` })), h('div', { className: 'ld-ring-text' }, children));
}
/** Controlled tabs with arrow, Home and End navigation.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Tabs({ items, value, onChange, label }) {
    return h('div', { className: 'ld-tabs', role: 'tablist', 'aria-label': label }, items.map((item, index) => h('button', { type: 'button', key: item.id, role: 'tab', 'aria-selected': value === item.id, tabIndex: value === item.id ? 0 : -1, onClick: () => onChange(item.id), onKeyDown: event => {
            if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length;
                onChange(items[next].id);
                event.currentTarget.parentElement.children[next].focus();
            }
        } }, item.label)));
}
/** Native dialog with Esc dismissal and trigger focus restoration.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Modal({ title, onClose, children, t }) {
    const ref = useRef(null);
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => { const trigger = document.activeElement; const node = ref.current; node.showModal(); const cancel = event => { event.preventDefault(); close.current(); }; node.addEventListener('cancel', cancel); return () => { node.removeEventListener('cancel', cancel); node.close(); if (trigger?.isConnected)
        trigger.focus(); }; }, []);
    return h('dialog', { ref, className: 'ld-modal', onClick: event => { if (event.target === event.currentTarget) {
            const box = event.currentTarget.getBoundingClientRect();
            if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)
                onClose();
        } }, 'aria-label': title }, h('header', { className: 'ld-row' }, h('h2', null, title), h(Button, { onClick: onClose, 'aria-label': t('close') }, '×')), children);
}
/** Labeled controlled input or textarea.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Field({ label, ...props }) { return h('label', { className: 'ld-field' }, h('span', null, label), h(props.multiline ? 'textarea' : 'input', { ...props, onInput: props.onChange, multiline: undefined })); }
/** Labeled native select control.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Select({ label, children, ...props }) { return h('label', { className: 'ld-field' }, h('span', null, label), h('select', props, children)); }
/** Localized alert for a failed view.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function ErrorBoundaryFallback({ t }) { return h('div', { role: 'alert', className: 'ld-error' }, t('errorTitle')); }
/** Contain rendering failures inside one section and report a localized alert. */
export class ErrorBoundary extends Component {
    constructor(props) { super(props); this.state = { error: false }; }
    static getDerivedStateFromError() { return { error: true }; }
    componentDidCatch(error) { console.error('[learning-desk] view failed', error); }
    render() { return this.state.error ? h(ErrorBoundaryFallback, { t: this.props.t }) : this.props.children; }
}
/** Pending-aware confirmation; failed writes leave the dialog open.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Confirm({ t, message, action, onClose }) {
    const [pending, setPending] = useState(false);
    return h(Modal, { title: t(message), t, onClose }, h('div', { className: 'ld-actions' }, h(Button, { onClick: onClose, disabled: pending }, t('cancel')), h(Button, { primary: true, disabled: pending, onClick: async () => { setPending(true); try {
            await action();
            onClose();
        }
        catch (error) {
            setPending(false);
        } } }, t('confirm'))));
}
