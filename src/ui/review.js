/** SM-2 session queue is fixed when opened, bounded by the user's review limit. */
import { createElement as h, useState, useEffect } from 'react';
import { dueCards } from '../domain/srs.js';
import { Button, EmptyState } from './components.js';
/** Due-card queue with Host-enforced daily limits and four grades.
 * @param {object} props - Data, callbacks and localized text for this view.
 * @returns {object|null} Rendered React element.
 */
export function Review({ data, store, t, onAdd }) {
    const [queue] = useState(() => dueCards(data.cards, Date.now()).slice(0, Math.max(0, data.settings.reviewLimit - (data.reviewCount || 0))).map(row => row.id));
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [pending, setPending] = useState(false);
    const id = queue[index];
    const card = data.cards.find(row => row.id === id);
    const score = async (grade) => { if (!card || !flipped || pending)
        return; setPending(true); try {
        await store.command({ type: 'review', id: card.id, grade });
        setIndex(index + 1);
        setFlipped(false);
    }
    catch (error) {
        void error;
    }
    finally {
        setPending(false);
    } };
    useEffect(() => { const listener = event => { if (event.target.closest('input,textarea,select,dialog'))
        return; if (['1', '2', '3', '4'].includes(event.key)) {
        event.preventDefault();
        void score(['again', 'hard', 'good', 'easy'][Number(event.key) - 1]);
    } }; document.addEventListener('keydown', listener); return () => document.removeEventListener('keydown', listener); }, [card, flipped, pending, index]);
    if (!card)
        return h(EmptyState, { t, hint: data.cards.length ? 'reviewDone' : 'emptyReview', action: 'addCard', onAction: onAdd });
    return h('div', { className: 'ld-review' }, h('div', { className: 'ld-row' }, h('span', { className: 'ld-muted' }, `${index + 1}/${queue.length}`), h('span', { className: 'ld-tag' }, data.decks.find(row => row.id === card.deckId)?.name)), h('h2', null, card.front), flipped && h('p', { className: 'ld-answer' }, card.back), !flipped ? h(Button, { primary: true, onClick: () => setFlipped(true) }, t('flip')) : h('div', { className: 'ld-actions' }, ['again', 'hard', 'good', 'easy'].map((grade, i) => h(Button, { key: grade, disabled: pending, onClick: () => score(grade) }, `${i + 1} · ${t(grade)}`))));
}
