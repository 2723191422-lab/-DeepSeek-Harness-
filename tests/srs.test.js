import test from 'node:test';
import assert from 'node:assert/strict';
import { initCard, reviewCard, dueCards } from '../src/domain/srs.js';

const DAY = 86400000;
/** 2026-03-09T00:00:00Z。 */
const T0 = 1773014400000;

test('initCard 返回默认状态并保留调用方 id 位', () => {
  const card = initCard('什么是闭包', '函数与其词法环境的组合', 'deck-1', T0);
  assert.deepEqual(card, {
    id: null,
    deckId: 'deck-1',
    front: '什么是闭包',
    back: '函数与其词法环境的组合',
    ease: 2.5,
    intervalDays: 0,
    due: T0,
    lapses: 0,
    reps: 0,
  });
  assert.throws(() => initCard('q', 'a', '', T0), /deckId 必填/);
});

test('连续 good 的间隔推进序列为 1 → 6 → 15 → 38', () => {
  let card = initCard('q', 'a', 'deck-1', T0);
  const intervals = [];
  const dues = [];
  for (let round = 0; round < 4; round += 1) {
    card = reviewCard(card, 'good', T0);
    intervals.push(card.intervalDays);
    dues.push(card.due);
  }
  assert.deepEqual(intervals, [1, 6, 15, 38]);
  assert.deepEqual(dues, [1, 6, 15, 38].map((days) => T0 + days * DAY));
  assert.equal(card.ease, 2.5);
  assert.equal(card.reps, 4);
  assert.equal(card.lapses, 0);
});

test('hard 递增间隔且提高难度，easy 加成并提高 ease', () => {
  const card = initCard('q', 'a', 'deck-1', T0);
  const firstGood = reviewCard(card, 'good', T0);
  const secondGood = reviewCard(firstGood, 'good', T0);

  const hard = reviewCard(secondGood, 'hard', T0);
  assert.equal(hard.intervalDays, 7);
  assert.equal(hard.ease, 2.35);
  assert.equal(hard.reps, 3);

  const hardFromFirst = reviewCard(card, 'hard', T0);
  assert.equal(hardFromFirst.intervalDays, 1);
  assert.equal(hardFromFirst.reps, 1);

  const easy = reviewCard(firstGood, 'easy', T0);
  assert.equal(easy.intervalDays, 8);
  assert.equal(easy.ease, 2.65);
  assert.equal(easy.reps, 2);
});

test('again 归零 reps、累加 lapses 并把间隔压回 1 天', () => {
  let card = initCard('q', 'a', 'deck-1', T0);
  card = reviewCard(card, 'good', T0);
  card = reviewCard(card, 'good', T0);
  card = reviewCard(card, 'good', T0);
  assert.equal(card.intervalDays, 15);

  const again = reviewCard(card, 'again', T0);
  assert.equal(again.intervalDays, 1);
  assert.equal(again.reps, 0);
  assert.equal(again.lapses, 1);
  assert.equal(again.ease, 2.3);
  assert.equal(again.due, T0 + DAY);

  const againAgain = reviewCard(again, 'again', T0);
  assert.equal(againAgain.lapses, 2);
  assert.equal(againAgain.reps, 0);
  assert.equal(againAgain.ease, 2.1);
});

test('ease 有 1.3 下限', () => {
  let card = initCard('q', 'a', 'deck-1', T0);
  for (let round = 0; round < 10; round += 1) {
    card = reviewCard(card, 'again', T0);
  }
  assert.equal(card.ease, 1.3);
  assert.equal(card.lapses, 10);
});

test('间隔上限为 365 天', () => {
  const long = { id: 'c1', deckId: 'd', front: 'q', back: 'a', ease: 2.5, intervalDays: 300, due: T0, lapses: 0, reps: 5 };
  const next = reviewCard(long, 'easy', T0);
  assert.equal(next.intervalDays, 365);
  assert.equal(next.due, T0 + 365 * DAY);
});

test('导入数据的 ease 低于下限时被夹取而不是抛错', () => {
  const corrupted = { id: 'c1', deckId: 'd', front: 'q', back: 'a', ease: 0.5, intervalDays: 3, due: T0, lapses: 0, reps: 2 };
  assert.equal(reviewCard(corrupted, 'again', T0).ease, 1.3);
  assert.equal(reviewCard(corrupted, 'good', T0).ease, 0.5);
  assert.throws(
    () => reviewCard({ ...corrupted, ease: 'easy' }, 'good', T0),
    /card.ease 必须是有限数字/,
  );
});

test('reviewCard 保留调用方写入的 id 且不改写入参', () => {
  const card = { ...initCard('q', 'a', 'deck-1', T0), id: 'card-1' };
  const snapshot = { ...card };
  const next = reviewCard(card, 'good', T0);
  assert.equal(next.id, 'card-1');
  assert.notEqual(next, card);
  assert.deepEqual(card, snapshot);
});

test('reviewCard 拒绝未知评分', () => {
  const card = initCard('q', 'a', 'deck-1', T0);
  assert.throws(() => reviewCard(card, 'perfect', T0), /grade 必须是 again \| hard \| good \| easy 之一/);
  assert.throws(() => reviewCard(null, 'good', T0), /card 必须是对象/);
});

test('dueCards 返回到期卡片并按到期时刻升序', () => {
  const cards = [
    { ...initCard('q1', 'a1', 'deck-1', T0), id: 'c1', due: T0 + 3 * DAY },
    { ...initCard('q2', 'a2', 'deck-1', T0), id: 'c2', due: T0 - DAY },
    { ...initCard('q3', 'a3', 'deck-1', T0), id: 'c3', due: T0 },
    { ...initCard('q4', 'a4', 'deck-1', T0), id: 'c4', due: T0 + DAY },
  ];
  assert.deepEqual(
    dueCards(cards, T0).map((card) => card.id),
    ['c2', 'c3'],
  );
  assert.equal(dueCards(cards, T0)[0], cards[1]);
  assert.deepEqual(
    dueCards(cards, T0 + DAY).map((card) => card.id),
    ['c2', 'c3', 'c4'],
  );
  assert.deepEqual(dueCards([], T0), []);
  assert.deepEqual(
    dueCards(cards, T0 - 2 * DAY).map((card) => card.id),
    [],
  );
  assert.throws(() => dueCards([{ id: 'x' }], T0), /cards\[0\].due 必须是 epoch 毫秒数字/);
});
