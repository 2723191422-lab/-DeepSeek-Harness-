import test from 'node:test';
import assert from 'node:assert/strict';
import { weekIndex, courseOccursOn, coursesOn } from '../src/domain/term-weeks.js';

/** 学期起始日：2026-03-02（周一）。 */
const TERM = '2026-03-02';

test('weekIndex 以学期起始日为第 1 周', () => {
  assert.equal(weekIndex('2026-03-02', TERM), 1);
  assert.equal(weekIndex('2026-03-08', TERM), 1);
  assert.equal(weekIndex('2026-03-09', TERM), 2);
  assert.equal(weekIndex('2026-03-16', TERM), 3);
  assert.equal(weekIndex('2026-06-15', TERM), 16);
  assert.equal(weekIndex('2026-06-22', TERM), 17);
});

test('weekIndex 对学期起始日之前的日期返回 ≤ 0', () => {
  assert.equal(weekIndex('2026-03-01', TERM), 0);
  assert.equal(weekIndex('2026-02-23', TERM), 0);
  assert.equal(weekIndex('2026-02-16', TERM), -1);
});

test('weekIndex 跨年与跨闰日按天差计算', () => {
  assert.equal(weekIndex('2025-01-06', '2025-01-06'), 1);
  assert.equal(weekIndex('2026-01-05', '2025-01-06'), 53);
  assert.equal(weekIndex('2024-03-04', '2024-02-26'), 2);
});

test('weekIndex 拒绝非法日期', () => {
  assert.throws(() => weekIndex('2026-3-2', TERM), /日期必须是 'YYYY-MM-DD' 字符串/);
  assert.throws(() => weekIndex('2026-02-30', TERM), /日期不存在：2026-02-30/);
  assert.throws(() => weekIndex('2026-03-02', '2026-13-01'), /日期不存在：2026-13-01/);
});

test('courseOccursOn 单双周错位不命中', () => {
  const odd = { weekday: 1, weeks: { from: 1, to: 16, parity: 'odd' } };
  const even = { weekday: 1, weeks: { from: 1, to: 16, parity: 'even' } };
  assert.equal(courseOccursOn(odd, '2026-03-02', TERM), true);
  assert.equal(courseOccursOn(odd, '2026-03-09', TERM), false);
  assert.equal(courseOccursOn(even, '2026-03-02', TERM), false);
  assert.equal(courseOccursOn(even, '2026-03-09', TERM), true);
  assert.equal(courseOccursOn(odd, '2026-03-16', TERM), true);
  assert.equal(courseOccursOn(even, '2026-03-16', TERM), false);
});

test('courseOccursOn 学期起止外的日期不命中（含区间端点包含性）', () => {
  const course = { weekday: 3, weeks: { from: 3, to: 4, parity: 'all' } };
  assert.equal(courseOccursOn(course, '2026-03-18', TERM), true);
  assert.equal(courseOccursOn(course, '2026-03-25', TERM), true);
  assert.equal(courseOccursOn(course, '2026-03-11', TERM), false);
  assert.equal(courseOccursOn(course, '2026-04-01', TERM), false);
  assert.equal(courseOccursOn(course, '2026-02-25', TERM), false);
  const wholeTerm = { weekday: 1, weeks: { from: 1, to: 16, parity: 'all' } };
  assert.equal(courseOccursOn(wholeTerm, '2026-06-22', TERM), false);
});

test('courseOccursOn 星期不匹配不命中，且 1..7 与 ISO 星期对齐', () => {
  const weekOneDates = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08'];
  weekOneDates.forEach((date, index) => {
    const weekday = index + 1;
    const course = { weekday, weeks: { from: 1, to: 1, parity: 'all' } };
    assert.equal(courseOccursOn(course, date, TERM), true, `${date} 应命中 weekday=${weekday}`);
  });
  assert.equal(courseOccursOn({ weekday: 2, weeks: { from: 1, to: 16, parity: 'all' } }, '2026-03-02', TERM), false);
});

test('courseOccursOn 缺省 weeks 视为整学期', () => {
  assert.equal(courseOccursOn({ weekday: 1 }, '2026-03-02', TERM), true);
  assert.equal(courseOccursOn({ weekday: 1, weeks: { from: 20, to: 24 } }, '2026-03-02', TERM), false);
});

test('courseOccursOn 拒绝非法课程与周次', () => {
  assert.throws(() => courseOccursOn(null, '2026-03-02', TERM), /course 必须是对象/);
  assert.throws(() => courseOccursOn({ weekday: 0 }, '2026-03-02', TERM), /course.weekday 必须是 1..7 的整数/);
  assert.throws(
    () => courseOccursOn({ weekday: 1, weeks: { parity: 'both' } }, '2026-03-02', TERM),
    /course.weeks.parity 必须是 all \| odd \| even/,
  );
  assert.throws(() => courseOccursOn({ weekday: 1, weeks: { from: 5, to: 2 } }, '2026-03-02', TERM), /course.weeks 非法/);
});

test('coursesOn 过滤并保持入参顺序', () => {
  const courses = [
    { id: 'a', name: 'A', weekday: 1, weeks: { from: 1, to: 16, parity: 'all' } },
    { id: 'b', name: 'B', weekday: 2, weeks: { from: 1, to: 16, parity: 'all' } },
    { id: 'c', name: 'C', weekday: 1, weeks: { from: 2, to: 16, parity: 'all' } },
    { id: 'd', name: 'D', weekday: 1, weeks: { from: 1, to: 16, parity: 'even' } },
  ];
  assert.deepEqual(
    coursesOn('2026-03-02', courses, TERM).map((course) => course.id),
    ['a'],
  );
  assert.deepEqual(
    coursesOn('2026-03-09', courses, TERM).map((course) => course.id),
    ['a', 'c', 'd'],
  );
  assert.equal(coursesOn('2026-03-09', courses, TERM)[0], courses[0]);
  assert.deepEqual(coursesOn('2026-03-02', [], TERM), []);
  assert.throws(() => coursesOn('2026-03-02', null, TERM), /courses 必须是数组/);
});
