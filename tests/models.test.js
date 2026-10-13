import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCourse,
  createTask,
  createFocusRecord,
  createNote,
  createDeck,
  createResource,
  createSettings,
} from '../src/domain/models.js';

/**
 * 深冻结入参，用于验证 creator 不改写入参（ESM 严格模式下写冻结对象会抛错）。
 * @param {*} value 待冻结的值
 * @returns {*} 冻结后的同一值
 */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}

test('createCourse 补齐默认值并复制入参', () => {
  const course = createCourse({
    id: 'c1',
    name: '高等数学',
    weekday: 1,
    start: '08:00',
    end: '09:40',
  });
  assert.deepEqual(course, {
    id: 'c1',
    name: '高等数学',
    teacher: '',
    location: '',
    weekday: 1,
    start: '08:00',
    end: '09:40',
    weeks: { from: 1, to: 16, parity: 'all' },
    color: '',
    note: '',
  });
});

test('createCourse 接受跨天时间与部分周次', () => {
  const course = createCourse({
    id: 'c2',
    name: '晚自习',
    weekday: 7,
    start: '23:00',
    end: '00:30',
    weeks: { parity: 'odd' },
  });
  assert.equal(course.start, '23:00');
  assert.equal(course.end, '00:30');
  assert.deepEqual(course.weeks, { from: 1, to: 16, parity: 'odd' });
});

test('createCourse 拒绝非法字段', () => {
  const base = { id: 'c1', name: '高数', weekday: 1, start: '08:00', end: '09:40' };
  const cases = [
    [{}, /id 必须是非空字符串/],
    [{ ...base, name: '' }, /name 不能为空字符串/],
    [{ ...base, weekday: 0 }, /weekday 必须落在 \[1, 7\]/],
    [{ ...base, weekday: 8 }, /weekday 必须落在 \[1, 7\]/],
    [{ ...base, weekday: 1.5 }, /weekday 必须是整数/],
    [{ ...base, start: '8:00' }, /start 格式非法/],
    [{ ...base, end: '24:00' }, /end 格式非法/],
    [{ ...base, weeks: { from: 5, to: 3 } }, /weeks.to（3）不能小于 weeks.from（5）/],
    [{ ...base, weeks: { parity: 'single' } }, /weeks.parity 必须是 all \| odd \| even/],
  ];
  for (const [input, pattern] of cases) {
    assert.throws(() => createCourse(input), pattern);
  }
  assert.throws(() => createCourse(null), /入参必须是普通对象/);
  assert.throws(() => createCourse([]), /入参必须是普通对象/);
});

test('createTask 补齐默认值并规范化子任务', () => {
  const task = createTask({
    id: 't1',
    title: '做完第三章',
    subtasks: [{ title: '3.1' }, { id: 'sub-2', title: '3.2', done: true }],
  });
  assert.deepEqual(task, {
    id: 't1',
    title: '做完第三章',
    courseId: null,
    date: null,
    estimateMin: 30,
    spentMin: 0,
    status: 'todo',
    priority: 'medium',
    tags: [],
    subtasks: [
      { id: 't1:s0', title: '3.1', done: false },
      { id: 'sub-2', title: '3.2', done: true },
    ],
    order: 0,
  });
});

test('createTask 去重标签、忽略未知字段、保留显式 null 日期', () => {
  const task = createTask({
    id: 't2',
    title: '背单词',
    date: null,
    tags: ['英语', '英语', '每日'],
    extra: 'ignored',
    estimateMin: 0,
  });
  assert.deepEqual(task.tags, ['英语', '每日']);
  assert.equal(task.date, null);
  assert.equal(task.estimateMin, 0);
  assert.equal('extra' in task, false);
});

test('createTask 拒绝非法字段', () => {
  const base = { id: 't1', title: 'x' };
  const cases = [
    [{ ...base, date: '2026/03/02' }, /date 格式非法/],
    [{ ...base, estimateMin: -1 }, /estimateMin 必须落在 \[0, Infinity\]/],
    [{ ...base, status: 'archived' }, /status 必须是 todo \| doing \| done/],
    [{ ...base, priority: 'urgent' }, /priority 必须是 low \| medium \| high/],
    [{ ...base, tags: ['ok', ''] }, /tags 的元素必须是非空字符串/],
    [{ ...base, subtasks: { title: 'x' } }, /subtasks 必须是数组/],
    [{ ...base, subtasks: [{ title: 'x', done: 'yes' }] }, /subtasks\[0\].done 必须是布尔值/],
    [{ ...base, subtasks: [{}] }, /subtasks\[0\].title 必填/],
  ];
  for (const [input, pattern] of cases) {
    assert.throws(() => createTask(input), pattern);
  }
});

test('createFocusRecord 校验时间戳与完成标记', () => {
  const record = createFocusRecord({ id: 'f1', start: 1773014400000, durationMin: 25 });
  assert.deepEqual(record, {
    id: 'f1',
    taskId: null,
    courseId: null,
    start: 1773014400000,
    durationMin: 25,
    mode: 'pomodoro',
    completed: true,
  });
  const partial = createFocusRecord({
    id: 'f2',
    taskId: 't1',
    start: 1773014400000,
    durationMin: 0,
    mode: 'countup',
    completed: false,
  });
  assert.equal(partial.completed, false);
  assert.equal(partial.mode, 'countup');
  assert.throws(() => createFocusRecord({ id: 'f3', durationMin: 10 }), /start 必填/);
  assert.throws(() => createFocusRecord({ id: 'f4', start: 1, durationMin: 10, completed: 'yes' }), /completed 必须是布尔值/);
  assert.throws(() => createFocusRecord({ id: 'f5', start: 1, durationMin: 10, mode: 'nap' }), /mode 必须是 pomodoro \| countup \| break/);
});

test('createNote 默认 updatedAt 等于 createdAt', () => {
  const note = createNote({ id: 'n1', title: '第一课', createdAt: 1000 });
  assert.deepEqual(note, {
    id: 'n1',
    title: '第一课',
    markdown: '',
    tags: [],
    linkTaskIds: [],
    linkCourseIds: [],
    createdAt: 1000,
    updatedAt: 1000,
  });
  const updated = createNote({ id: 'n2', createdAt: 1000, updatedAt: 2000, linkTaskIds: ['t1', 't1'] });
  assert.equal(updated.updatedAt, 2000);
  assert.deepEqual(updated.linkTaskIds, ['t1']);
  assert.throws(() => createNote({ id: 'n3' }), /createdAt 必填/);
});

test('createDeck / createResource 补齐默认值', () => {
  assert.deepEqual(createDeck({ id: 'd1', name: '英语' }), {
    id: 'd1',
    name: '英语',
    courseId: null,
    description: '',
  });
  assert.deepEqual(createResource({ id: 'r1', title: '线性代数公开课' }), {
    id: 'r1',
    title: '线性代数公开课',
    url: '',
    kind: 'link',
    tags: [],
    status: 'unread',
    progress: 0,
    note: '',
  });
  assert.throws(() => createDeck({ id: 'd1', name: '' }), /name 不能为空字符串/);
  assert.throws(() => createResource({ id: 'r1', title: 'x', kind: 'podcast' }), /kind 必须是 link \| book \| course \| video/);
  assert.throws(() => createResource({ id: 'r1', title: 'x', progress: 1.5 }), /progress 必须落在 \[0, 1\]/);
});

test('createSettings 支持无参调用并校验字段', () => {
  assert.deepEqual(createSettings(), {
    dailyGoalMin: 120,
    pomodoroMin: 25,
    breakMin: 5,
    reviewLimit: 20,
    termStartDate: null,
    weekStartsOn: 1,
    theme: 'system',
  });
  const custom = createSettings({ termStartDate: '2026-03-02', weekStartsOn: 7, theme: 'dark', dailyGoalMin: 0 });
  assert.equal(custom.termStartDate, '2026-03-02');
  assert.equal(custom.weekStartsOn, 7);
  assert.equal(custom.theme, 'dark');
  assert.equal(custom.dailyGoalMin, 0);
  assert.throws(() => createSettings({ weekStartsOn: 0 }), /weekStartsOn 必须落在 \[1, 7\]/);
  assert.throws(() => createSettings({ termStartDate: '2026-3-2' }), /termStartDate 格式非法/);
  assert.throws(() => createSettings({ theme: 'midnight' }), /theme 必须是 system \| light \| dark/);
  assert.throws(() => createSettings({ reviewLimit: 0 }), /reviewLimit 必须落在 \[1, Infinity\]/);
});

test('creator 不改写入参且不产生 Date 实例', () => {
  const input = deepFreeze({
    id: 'c1',
    name: '高数',
    weekday: 1,
    start: '08:00',
    end: '09:40',
    weeks: { from: 2, to: 8, parity: 'even' },
  });
  const course = createCourse(input);
  assert.deepEqual(course.weeks, { from: 2, to: 8, parity: 'even' });
  assert.notEqual(course.weeks, input.weeks);
  assert.equal(JSON.parse(JSON.stringify(course)).name, '高数');

  const taskInput = deepFreeze({ id: 't1', title: 'x', subtasks: [{ title: 'a' }] });
  createTask(taskInput);
  assert.deepEqual(taskInput.subtasks, [{ title: 'a' }]);
});
