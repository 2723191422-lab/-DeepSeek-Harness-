import test from 'node:test';
import assert from 'node:assert/strict';
import { composeDayPlan } from '../src/domain/schedule.js';
import { createCourse, createTask } from '../src/domain/models.js';

/** 学期起始日 2026-03-02 是周一。 */
const TERM = '2026-03-02';
const MON_W1 = '2026-03-02';
const MON_W2 = '2026-03-09';

/**
 * 造一条课表条目。
 * @param {string} id id
 * @param {number} weekday ISO 星期
 * @param {string} start 开始时刻
 * @param {string} end 结束时刻
 * @param {object} [weeks] 周次
 * @returns {object} Course
 */
function course(id, weekday, start, end, weeks) {
  return createCourse({ id, name: id, weekday, start, end, weeks });
}

/**
 * 造一条任务。
 * @param {string} id id
 * @param {string|null} date 日期
 * @param {number} estimateMin 预估分钟
 * @param {string} [priority] 优先级
 * @param {number} [order] 排序权重
 * @param {object} [extra] 额外字段
 * @returns {object} Task
 */
function task(id, date, estimateMin, priority = 'medium', order = 0, extra = {}) {
  return createTask({ id, title: id, date, estimateMin, priority, order, ...extra });
}

/**
 * 造一份 composeDayPlan 入参。
 * @param {object} patch 覆盖字段
 * @returns {object} 入参
 */
function input(patch) {
  return {
    dateStr: MON_W1,
    dayStart: '08:00',
    dayEnd: '22:00',
    termStartDateStr: TERM,
    courses: [],
    tasks: [],
    overrides: [],
    ...patch,
  };
}

test('固定块 + 任务顺序填充 + 剩余空闲', () => {
  const plan = composeDayPlan(
    input({
      courses: [course('c1', 1, '08:00', '09:40')],
      tasks: [task('t1', MON_W1, 60, 'high', 0), task('t2', MON_W1, 30, 'low', 1)],
    }),
  );
  assert.deepEqual(
    plan.fixed.map((block) => [block.id, block.kind, block.start, block.end, block.minutes]),
    [['c:c1', 'course', '08:00', '09:40', 100]],
  );
  assert.deepEqual(
    plan.scheduled.map((block) => [block.id, block.start, block.end, block.moved]),
    [
      ['t:t1', '09:40', '10:40', false],
      ['t:t2', '10:40', '11:10', false],
    ],
  );
  assert.deepEqual(plan.overflow, []);
  assert.equal(plan.freeMinutes, 650);
});

test('高优先级先排，其次按 order', () => {
  const plan = composeDayPlan(
    input({
      tasks: [
        task('low', MON_W1, 30, 'low', 0),
        task('mid-late', MON_W1, 30, 'medium', 5),
        task('mid-early', MON_W1, 30, 'medium', 1),
        task('high', MON_W1, 30, 'high', 9),
      ],
    }),
  );
  assert.deepEqual(
    plan.scheduled.map((block) => block.id),
    ['t:high', 't:mid-early', 't:mid-late', 't:low'],
  );
});

test('待排集合：日期命中 ∪ 待排池 todo；已完成、doing、他日任务不入列', () => {
  const plan = composeDayPlan(
    input({
      tasks: [
        task('dated', MON_W1, 30),
        task('pool', null, 30),
        task('pool-doing', null, 30, 'medium', 0, { status: 'doing' }),
        task('done', MON_W1, 30, 'medium', 0, { status: 'done' }),
        task('other-day', MON_W2, 30),
      ],
    }),
  );
  assert.deepEqual(
    plan.scheduled.map((block) => block.id),
    ['t:dated', 't:pool'],
  );
});

test('单双周错位：偶数周不排单周课', () => {
  const odd = course('c1', 1, '08:00', '09:40', { from: 1, to: 16, parity: 'odd' });
  const oddWeek = composeDayPlan(input({ dateStr: MON_W1, courses: [odd], tasks: [task('t1', MON_W1, 60)] }));
  assert.equal(oddWeek.fixed.length, 1);
  assert.equal(oddWeek.scheduled[0].start, '09:40');

  const evenWeek = composeDayPlan(input({ dateStr: MON_W2, courses: [odd], tasks: [task('t1', MON_W2, 60)] }));
  assert.deepEqual(evenWeek.fixed, []);
  assert.equal(evenWeek.scheduled[0].start, '08:00');
  assert.equal(evenWeek.freeMinutes, 780);
});

test('学期起止外日期：课不命中，任务照排', () => {
  const wholeTerm = course('c1', 1, '08:00', '09:40');
  const afterTerm = composeDayPlan(input({ dateStr: '2026-06-22', courses: [wholeTerm], tasks: [task('t1', '2026-06-22', 30)] }));
  assert.deepEqual(afterTerm.fixed, []);
  assert.equal(afterTerm.scheduled[0].start, '08:00');

  const beforeTerm = composeDayPlan(input({ dateStr: '2026-02-23', courses: [wholeTerm], tasks: [] }));
  assert.deepEqual(beforeTerm.fixed, []);

  const lastWeek = composeDayPlan(input({ dateStr: '2026-06-15', courses: [wholeTerm], tasks: [] }));
  assert.equal(lastWeek.fixed.length, 1);
});

test('跨天窗口：课与任务都映射到窗口的绝对分钟', () => {
  const plan = composeDayPlan(
    input({
      dayStart: '20:00',
      dayEnd: '02:00',
      courses: [course('c1', 1, '23:00', '00:30')],
      tasks: [task('t1', MON_W1, 60)],
    }),
  );
  assert.deepEqual(
    plan.fixed.map((block) => [block.startMin, block.endMin, block.start, block.end, block.minutes]),
    [[1380, 1470, '23:00', '00:30', 90]],
  );
  assert.deepEqual(
    plan.scheduled.map((block) => [block.startMin, block.endMin, block.start, block.end]),
    [[1200, 1260, '20:00', '21:00']],
  );
  assert.equal(plan.freeMinutes, 210);
});

test('跨天窗口：次日凌晨的课整体后移一天落在窗口内', () => {
  const plan = composeDayPlan(
    input({
      dayStart: '20:00',
      dayEnd: '02:00',
      courses: [course('c2', 1, '00:30', '02:00')],
      tasks: [],
    }),
  );
  assert.deepEqual(
    plan.fixed.map((block) => [block.startMin, block.endMin, block.start, block.end]),
    [[1470, 1560, '00:30', '02:00']],
  );
  assert.equal(plan.freeMinutes, 270);
});

test('不跨天窗口：起点早于窗口的课只占用重叠部分', () => {
  const plan = composeDayPlan(
    input({
      dayEnd: '23:00',
      courses: [course('c1', 1, '07:00', '08:30')],
      tasks: [task('t1', MON_W1, 60)],
    }),
  );
  assert.deepEqual(
    plan.fixed.map((block) => [block.startMin, block.endMin, block.start, block.end]),
    [[420, 510, '07:00', '08:30']],
  );
  assert.deepEqual(
    plan.scheduled.map((block) => [block.start, block.end]),
    [['08:30', '09:30']],
  );
  assert.equal(plan.freeMinutes, 810);
});

test('课表重叠：占用区间取并集，任务排在并集之后', () => {
  const plan = composeDayPlan(
    input({
      dayEnd: '23:00',
      courses: [course('c1', 1, '08:00', '10:00'), course('c2', 1, '09:00', '11:00')],
      tasks: [task('t1', MON_W1, 30)],
    }),
  );
  assert.equal(plan.fixed.length, 2);
  assert.deepEqual(
    plan.scheduled.map((block) => [block.start, block.end]),
    [['11:00', '11:30']],
  );
  assert.equal(plan.freeMinutes, 690);
});

test('estimateMin 大于最长空闲 → 进待办池（返回原任务引用）；不足 15 分钟的碎片不投放', () => {
  const tasks = [
    task('big', MON_W1, 90, 'high', 0),
    task('mid', MON_W1, 50, 'medium', 1),
    task('small', MON_W1, 30, 'low', 2),
  ];
  const plan = composeDayPlan(
    input({
      dateStr: MON_W1,
      dayStart: '08:00',
      dayEnd: '12:00',
      courses: [course('c1', 1, '09:00', '11:00')],
      tasks,
    }),
  );
  assert.deepEqual(
    plan.scheduled.map((block) => [block.id, block.start, block.end]),
    [
      ['t:mid', '08:00', '08:50'],
      ['t:small', '11:00', '11:30'],
    ],
  );
  assert.deepEqual(
    plan.overflow.map((item) => item.id),
    ['big'],
  );
  assert.equal(plan.overflow[0], tasks[0]);
  assert.equal(plan.freeMinutes, 40);
});

test('estimateMin 恰好填满最长空闲时放下，剩余空闲归零', () => {
  const plan = composeDayPlan(
    input({
      dateStr: MON_W1,
      dayStart: '08:00',
      dayEnd: '10:00',
      courses: [course('c1', 1, '08:00', '09:00')],
      tasks: [task('exact', MON_W1, 60)],
    }),
  );
  assert.deepEqual(
    plan.scheduled.map((block) => [block.start, block.end]),
    [['09:00', '10:00']],
  );
  assert.deepEqual(plan.overflow, []);
  assert.equal(plan.freeMinutes, 0);
});

test('覆盖：新增块占位后任务顺延', () => {
  const base = {
    dayStart: '08:00',
    dayEnd: '12:00',
    tasks: [task('a', MON_W1, 60, 'high', 0), task('b', MON_W1, 60, 'high', 1)],
  };
  const without = composeDayPlan(input(base));
  assert.deepEqual(
    without.scheduled.map((block) => block.start),
    ['08:00', '09:00'],
  );
  const withAdd = composeDayPlan(
    input({ ...base, overrides: [{ id: 'u1', type: 'add', title: '小组会', start: '08:00', end: '09:00' }] }),
  );
  assert.deepEqual(
    withAdd.fixed.map((block) => [block.id, block.kind, block.title, block.start, block.end]),
    [['u:u1', 'custom', '小组会', '08:00', '09:00']],
  );
  assert.deepEqual(
    withAdd.scheduled.map((block) => block.start),
    ['09:00', '10:00'],
  );
  assert.equal(withAdd.freeMinutes, 60);
});

test('覆盖：move 保持新位置且不再参与排程', () => {
  const plan = composeDayPlan(
    input({
      dayStart: '08:00',
      dayEnd: '12:00',
      tasks: [task('a', MON_W1, 60, 'high', 0), task('b', MON_W1, 60, 'high', 1)],
      overrides: [{ id: 'u2', type: 'move', refId: 't:a', start: '10:00', end: '11:00' }],
    }),
  );
  assert.deepEqual(
    plan.scheduled.map((block) => [block.id, block.start, block.end, block.moved]),
    [
      ['t:b', '08:00', '09:00', false],
      ['t:a', '10:00', '11:00', true],
    ],
  );
  assert.equal(plan.freeMinutes, 120);
});

test('覆盖：move 课表块保持新位置', () => {
  const plan = composeDayPlan(
    input({
      courses: [course('c1', 1, '08:00', '09:40')],
      overrides: [{ id: 'u3', type: 'move', refId: 'c:c1', start: '10:00', end: '11:00' }],
      tasks: [task('t1', MON_W1, 60)],
    }),
  );
  assert.deepEqual(
    plan.fixed.map((block) => [block.id, block.start, block.end, block.moved]),
    [['c:c1', '10:00', '11:00', true]],
  );
  assert.deepEqual(
    plan.scheduled.map((block) => [block.start, block.end]),
    [['08:00', '09:00']],
  );
});

test('覆盖：被删除的块不复活（任务与课表）', () => {
  const removeTask = composeDayPlan(
    input({
      dayStart: '08:00',
      dayEnd: '12:00',
      tasks: [task('a', MON_W1, 60, 'high', 0), task('b', MON_W1, 60, 'high', 1)],
      overrides: [{ id: 'u4', type: 'remove', refId: 't:a' }],
    }),
  );
  assert.deepEqual(
    removeTask.scheduled.map((block) => block.id),
    ['t:b'],
  );
  assert.deepEqual(removeTask.overflow, []);

  const removeCourse = composeDayPlan(
    input({
      dayStart: '08:00',
      dayEnd: '12:00',
      courses: [course('c1', 1, '08:00', '09:00')],
      tasks: [task('a', MON_W1, 60)],
      overrides: [{ id: 'u5', type: 'remove', refId: 'c:c1' }],
    }),
  );
  assert.deepEqual(removeCourse.fixed, []);
  assert.deepEqual(
    removeCourse.scheduled.map((block) => block.start),
    ['08:00'],
  );
});

test('覆盖：新增块可以被同一批覆盖删除，且不改写入参', () => {
  const overrides = [
    { id: 'u1', type: 'add', title: '小组会', start: '08:00', end: '09:00' },
    { id: 'u6', type: 'remove', refId: 'u:u1' },
  ];
  const snapshot = JSON.parse(JSON.stringify(overrides));
  const plan = composeDayPlan(input({ dayStart: '08:00', dayEnd: '12:00', overrides }));
  assert.deepEqual(plan.fixed, []);
  assert.deepEqual(overrides, snapshot);
});

test('dayEnd 等于 dayStart 视为整天 24 小时', () => {
  const plan = composeDayPlan(input({ dayStart: '08:00', dayEnd: '08:00', tasks: [task('t1', MON_W1, 30)] }));
  assert.deepEqual(
    plan.scheduled.map((block) => [block.start, block.end]),
    [['08:00', '08:30']],
  );
  assert.equal(plan.freeMinutes, 1440 - 30);
});

test('无任务时 freeMinutes 等于窗口减去固定块', () => {
  const plan = composeDayPlan(input({ courses: [course('c1', 1, '08:00', '09:40')] }));
  assert.equal(plan.freeMinutes, 740);
});

test('composeDayPlan 是纯函数：重复调用结果一致且不改写入参', () => {
  const args = input({
    courses: [course('c1', 1, '08:00', '09:40')],
    tasks: [task('t1', MON_W1, 60)],
    overrides: [{ id: 'u1', type: 'add', title: '晨读', start: '07:30', end: '08:00' }],
  });
  const snapshot = JSON.parse(JSON.stringify(args));
  const first = composeDayPlan(args);
  const second = composeDayPlan(args);
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(args)), snapshot);
});

test('composeDayPlan 参数非法时抛出明确错误', () => {
  assert.throws(() => composeDayPlan(null), /入参必须是普通对象/);
  assert.throws(() => composeDayPlan(input({ dateStr: '2026/03/02' })), /dateStr 必须是 'YYYY-MM-DD' 字符串/);
  assert.throws(() => composeDayPlan(input({ dayStart: '8:00' })), /dayStart 必须是 'HH:mm' 时刻/);
  assert.throws(() => composeDayPlan(input({ dayEnd: '25:00' })), /dayEnd 必须是 'HH:mm' 时刻/);
  assert.throws(() => composeDayPlan(input({ courses: {} })), /courses 必须是数组/);
  assert.throws(() => composeDayPlan(input({ tasks: 'x' })), /tasks 必须是数组/);
  assert.throws(() => composeDayPlan(input({ overrides: [{}] })), /overrides\[0\].type 必须是 remove \| move \| add 之一/);
  assert.throws(
    () => composeDayPlan(input({ overrides: [{ id: 'u1', type: 'move' }] })),
    /overrides\[0\].refId 必须是非空字符串/,
  );
  assert.throws(
    () => composeDayPlan(input({ overrides: [{ id: 'u1', type: 'add', start: '08:00', end: '09:00' }] })),
    /overrides\[0\].title 必须是非空字符串/,
  );
});
