import test from 'node:test';
import assert from 'node:assert/strict';
import { streakDays, heatmap, minutesByTag, completionRate } from '../src/domain/stats.js';

const DAY = 86400000;
/** 2026-03-09 的 UTC 日序。 */
const D = 20521;
/**
 * 相对 2026-03-09 的某一天上午 9 点的 epoch 毫秒。
 * @param {number} offset 相对天数（负数为更早）
 * @param {number} [hour] 小时
 * @returns {number} epoch 毫秒
 */
function at(offset, hour = 9) {
  return (D + offset) * DAY + hour * 3600000;
}

/**
 * 造一条专注记录。
 * @param {number} offset 相对 2026-03-09 的天数
 * @param {number} minutes 时长
 * @param {object} [extra] 额外字段
 * @returns {object} FocusRecord
 */
function focus(offset, minutes, extra = {}) {
  return { id: `f${offset}_${minutes}`, start: at(offset), durationMin: minutes, completed: true, ...extra };
}

test('streakDays 统计连续达标天数', () => {
  const records = [-4, -3, -2, -1, 0].map((offset) => focus(offset, 60));
  assert.equal(streakDays(records, '2026-03-09', 60), 5);
  assert.equal(streakDays(records, '2026-03-09', 61), 0);
  assert.equal(streakDays(records, '2026-03-09', 30), 5);
});

test('当天未达标不打断历史连续', () => {
  const records = [-3, -2, -1].map((offset) => focus(offset, 60));
  assert.equal(streakDays(records, '2026-03-09', 60), 3);
  assert.equal(streakDays([...records, focus(0, 60)], '2026-03-09', 60), 4);
  assert.equal(streakDays(records, '2026-03-10', 60), 0);
});

test('断档会截断连续天数', () => {
  const records = [-7, -5, -4, -3, -2, -1, 0].map((offset) => focus(offset, 60));
  assert.equal(streakDays(records, '2026-03-09', 60), 6);
  const withGapFilled = [...records, focus(-6, 60)];
  assert.equal(streakDays(withGapFilled, '2026-03-09', 60), 8);
});

test('同日多条记录累加，completed=false 不计入', () => {
  const split = [focus(0, 20, { id: 'a' }), focus(0, 20, { id: 'b' })];
  assert.equal(streakDays(split, '2026-03-09', 40), 1);
  assert.equal(streakDays(split, '2026-03-09', 41), 0);

  const aborted = [focus(-1, 100, { completed: false }), ...split];
  assert.equal(streakDays(aborted, '2026-03-09', 60), 0);
});

test('无记录返回 0；目标为 0 时按有记录即达标', () => {
  assert.equal(streakDays([], '2026-03-09', 60), 0);
  const records = [focus(0, 5), focus(-1, 5), focus(-3, 5)];
  assert.equal(streakDays(records, '2026-03-09', 0), 2);
  assert.equal(streakDays(records, '2026-03-09', 1), 2);
});

test('未来记录不影响当前连续天数', () => {
  const records = [focus(0, 60), focus(1, 60), focus(2, 60)];
  assert.equal(streakDays(records, '2026-03-09', 60), 1);
});

test('streakDays 拒绝非法参数', () => {
  assert.throws(() => streakDays(null, '2026-03-09', 60), /records 必须是数组/);
  assert.throws(() => streakDays([], '2026-3-9', 60), /日期必须是 'YYYY-MM-DD' 字符串/);
  assert.throws(() => streakDays([], '2026-03-09', -1), /dailyGoalMin 必须是非负有限数字/);
});

test('heatmap 返回以 endDate 结尾的连续日期序列', () => {
  const records = [focus(-1, 45), focus(0, 90), focus(-40, 30)];
  const cells = heatmap(records, '2026-03-09', 2);
  assert.equal(cells.length, 14);
  assert.deepEqual(cells[0], { date: '2026-02-24', minutes: 0 });
  assert.deepEqual(cells[12], { date: '2026-03-08', minutes: 45 });
  assert.deepEqual(cells[13], { date: '2026-03-09', minutes: 90 });
  const week = heatmap(records, '2026-03-09', 1);
  assert.equal(week.length, 7);
  assert.deepEqual(week[6], { date: '2026-03-09', minutes: 90 });
  assert.equal(week[0].date, '2026-03-03');
  assert.throws(() => heatmap([], '2026-03-09', 0), /weeks 必须是 ≥ 1 的整数/);
});

test('minutesByTag 按任务标签汇总，未关联记录不计入', () => {
  const tasks = [
    { id: 't1', tags: ['数学', '考试'] },
    { id: 't2', tags: ['数学'] },
    { id: 't3', tags: [] },
  ];
  const records = [
    { id: 'r1', taskId: 't1', start: at(0), durationMin: 30, completed: true },
    { id: 'r2', taskId: 't1', start: at(0), durationMin: 20, completed: true },
    { id: 'r3', taskId: 't2', start: at(-1), durationMin: 10, completed: true },
    { id: 'r4', taskId: 't3', start: at(-1), durationMin: 15, completed: true },
    { id: 'r5', start: at(-2), durationMin: 99, completed: true },
    { id: 'r6', taskId: 'missing', start: at(-2), durationMin: 50, completed: true },
    { id: 'r7', taskId: 't1', start: at(-3), durationMin: 40, completed: false },
  ];
  assert.deepEqual(minutesByTag(records, tasks), { 数学: 60, 考试: 50 });
  assert.deepEqual(minutesByTag([], tasks), {});
  assert.deepEqual(minutesByTag(records, []), {});
});

test('completionRate 覆盖区间端点且只统计有日期的任务', () => {
  const tasks = [
    { id: 'a', date: '2026-03-02', status: 'done' },
    { id: 'b', date: '2026-03-05', status: 'todo' },
    { id: 'c', date: '2026-03-09', status: 'done' },
    { id: 'd', date: '2026-03-10', status: 'done' },
    { id: 'e', date: null, status: 'done' },
  ];
  assert.equal(completionRate(tasks, '2026-03-02', '2026-03-09'), 2 / 3);
  assert.equal(completionRate(tasks, '2026-03-09', '2026-03-09'), 1);
  assert.equal(completionRate(tasks, '2026-03-02', '2026-03-02'), 1);
  assert.equal(completionRate([tasks[3]], '2026-03-02', '2026-03-09'), 0);
  assert.equal(completionRate([], '2026-03-02', '2026-03-09'), 0);
  assert.throws(() => completionRate(tasks, '2026-03-09', '2026-03-02'), /toStr（2026-03-02）不能早于 fromStr（2026-03-09）/);
});

test('脏数据只跳过该条记录，不影响整体聚合', () => {
  const tasks = [
    { id: 'a', date: '2026-03-02', status: 'done' },
    { id: 'bad-date', date: '2026-02-30', status: 'done' },
    { id: 'bad-type', date: 20260305, status: 'done' },
  ];
  assert.equal(completionRate(tasks, '2026-03-01', '2026-03-31'), 1);

  const records = [
    { id: 'ok', start: at(0), durationMin: 60, completed: true },
    { id: 'no-start', durationMin: 600, completed: true },
    { id: 'bad-start', start: 'yesterday', durationMin: 600, completed: true },
    { id: 'bad-duration', start: at(0), durationMin: 'many', completed: true },
    null,
    undefined,
    'nonsense',
  ];
  assert.equal(streakDays(records, '2026-03-09', 60), 1);
  assert.deepEqual(heatmap(records, '2026-03-09', 1).slice(-1), [{ date: '2026-03-09', minutes: 60 }]);
  assert.deepEqual(minutesByTag(records, [{ id: 't', tags: ['x'] }]), {});
});
