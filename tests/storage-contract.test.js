import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import {
  TABLES,
  UNIT_NAME_RE,
  apply,
  defineDomain,
  domainTable,
  inject,
  learningDeskDomain,
  validateRecord,
} from '../index.js';
import {
  createCourse,
  createDeck,
  createFocusRecord,
  createNote,
  createResource,
  createSettings,
  createTask,
} from '../src/domain/models.js';
import { composeDayPlan } from '../src/domain/schedule.js';
import { initCard, reviewCard } from '../src/domain/srs.js';
import { settingsSchema, taskSchema } from '../src/storage/schema.js';

/**
 * 漂移守卫：Host 半边声明的表（`index.js` 导出的 `TABLES`）必须与
 * `src/domain/models.js` / `srs.js` / `schedule.js` 的真实产出逐字段对齐。
 *
 * 两个方向都验：creator 产出必须通过对应表的 schema；把任一字段（含嵌套字段）
 * 的类型扭转一次必须被拒收。放宽 schema 或改坏 creator 都会让本文件变红。
 */

/** 固定时间戳（epoch 毫秒），避免用例依赖真实时钟。 */
const NOW = 1_700_000_000_000;

/** 学期起始日（周一）与其中的目的日期：第 6 周、ISO 周一。 */
const TERM_START = '2026-09-07';
const DAY = '2026-10-12';

const course = createCourse({
  id: 'c1',
  name: '高等数学',
  teacher: '李老师',
  location: '教三-201',
  weekday: 1,
  start: '08:00',
  end: '09:40',
  weeks: { from: 1, to: 16, parity: 'all' },
  color: 'blue',
  note: '带教材',
});
const task = createTask({
  id: 't1',
  title: '习题 3.1',
  courseId: 'c1',
  date: DAY,
  estimateMin: 45,
  priority: 'high',
  tags: ['math', 'math'],
  subtasks: [{ title: '3.1.1', done: false }],
  order: 2,
});
// 最小字段：courseId / date 走 null 分支
const pendingTask = createTask({ id: 't2', title: '写实验报告' });
const focusRecord = createFocusRecord({
  id: 'f1',
  taskId: 't1',
  courseId: 'c1',
  start: NOW,
  durationMin: 25,
  mode: 'pomodoro',
  completed: true,
});
const note = createNote({
  id: 'n1',
  title: '泰勒展开',
  markdown: '# 泰勒展开\n余项是拉格朗日型。',
  tags: ['math'],
  linkTaskIds: ['t1'],
  linkCourseIds: ['c1'],
  createdAt: NOW,
  updatedAt: NOW + 60_000,
});
// 最小字段：title / markdown / updatedAt 走默认值
const minimalNote = createNote({ id: 'n2', createdAt: NOW });
const deck = createDeck({ id: 'd1', name: '高数公式', courseId: 'c1', description: '第 3 章' });
// initCard 不生成 id（契约定为 null），由调用方补齐后再入库
const card = { ...initCard('泰勒展开', 'f(x) = Σ f⁽ⁿ⁾(a)/n! · (x-a)ⁿ', 'd1', NOW), id: 'k1' };
const reviewedCard = { ...reviewCard(card, 'good', NOW), id: 'k1' };
const resource = createResource({
  id: 'r1',
  title: '线性代数讲义',
  url: 'https://example.com/la',
  kind: 'book',
  status: 'reading',
  progress: 0.5,
  tags: ['math'],
  note: '第 2 章',
});
// 最小字段：url / kind / status / progress / note 走默认值
const minimalResource = createResource({ id: 'r2', title: 'CTF 入门' });
const settings = createSettings({ termStartDate: TERM_START });

// 三种覆盖齐全（move / add / remove），并让合成结果同时含固定块、任务块与自定义块
const overrides = [
  { id: 'o1', type: 'move', refId: 't:t2', start: '20:00', end: '21:00' },
  { id: 'o2', type: 'add', title: '答疑', start: '21:00', end: '21:30' },
  { id: 'o3', type: 'remove', refId: 'u:absent' },
];
const composed = composeDayPlan({
  dateStr: DAY,
  dayStart: '08:00',
  dayEnd: '22:00',
  courses: [course],
  tasks: [task, pendingTask],
  overrides,
  termStartDateStr: TERM_START,
});
// 存库的 DayPlan 是 { date, blocks, overrides }：blocks 取合成结果的固定块与已排块，
// 派生字段（overflow / freeMinutes）不入库（docs/02-dsh-plugin-spec.md §3.1）。
// src/domain 里没有 createDayPlan，这条记录由调用方按 §3 组装。
const dayPlan = { date: DAY, blocks: [...composed.fixed, ...composed.scheduled], overrides };

/** 每张表至少一条真实产出。 @type {[string, object][]} */
const RECORDS = [
  ['courses', course],
  ['tasks', task],
  ['tasks', pendingTask],
  ['day_plans', dayPlan],
  ['focus_records', focusRecord],
  ['notes', note],
  ['notes', minimalNote],
  ['cards', card],
  ['cards', reviewedCard],
  ['decks', deck],
  ['resources', resource],
  ['resources', minimalResource],
];

/**
 * 沿路径替换一个值，返回新对象（不改写入参）。
 * @param {*} node 原值
 * @param {(string|number)[]} path 字段路径
 * @param {*} value 替换值
 * @returns {*} 替换后的值
 */
function setAt(node, path, value) {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(node)) {
    const copy = node.slice();
    copy[head] = setAt(node[head], rest, value);
    return copy;
  }
  return { ...node, [head]: setAt(node[head], rest, value) };
}

/**
 * 列出把每个叶子与容器各扭转一次的路径和扭转值。
 * @param {*} node 当前值
 * @param {(string|number)[]} path 当前路径
 * @returns {{path: (string|number)[], value: *}[]} 扭转目标
 */
function twistTargets(node, path = []) {
  if (node === null) return [{ path, value: true }];
  if (Array.isArray(node)) {
    const targets = [{ path, value: {} }];
    node.forEach((child, index) => targets.push(...twistTargets(child, [...path, index])));
    return targets;
  }
  if (typeof node === 'object') {
    const targets = [{ path, value: 'twisted' }];
    for (const [key, child] of Object.entries(node)) targets.push(...twistTargets(child, [...path, key]));
    return targets;
  }
  if (typeof node === 'string') return [{ path, value: 12345 }];
  if (typeof node === 'number') return [{ path, value: '12345' }];
  if (typeof node === 'boolean') return [{ path, value: 'true' }];
  return [{ path, value: 'twisted' }];
}

/**
 * 读取一张表的 schema。
 * @param {string} table 表名
 * @returns {import('zod').ZodType} 该表的记录 schema
 */
function schemaOf(table) {
  const spec = TABLES[table];
  assert.ok(spec !== undefined, `未知表 ${table}`);
  return spec.valueSchema;
}

test('domain 身份合法：name / version / 8 张表名都匹配 UNIT_NAME_RE', () => {
  assert.equal(learningDeskDomain.name, 'learning_desk');
  assert.equal(learningDeskDomain.version, 1);
  assert.match(learningDeskDomain.name, UNIT_NAME_RE);
  assert.deepEqual(
    Object.keys(TABLES).sort(),
    ['cards', 'courses', 'day_plans', 'decks', 'focus_records', 'notes', 'resources', 'tasks'],
  );
  for (const table of Object.keys(TABLES)) {
    assert.match(table, UNIT_NAME_RE, `表名 ${table} 必须匹配 UNIT_NAME_RE`);
    assert.equal(typeof TABLES[table].valueSchema.safeParse, 'function', `表 ${table} 必须带 zod schema`);
  }
  assert.equal(learningDeskDomain.tables, TABLES, 'domain 规格与导出的 TABLES 必须是同一份声明');
});

test('creator 的真实产出逐条通过对应表的 schema，且字段集合完全一致', () => {
  for (const [table, record] of RECORDS) {
    const result = schemaOf(table).safeParse(record);
    assert.ok(result.success, `${table} 拒绝了自己的 creator 产出：${JSON.stringify(result.error?.issues)}`);
    // zod 会剥掉未声明的字段；解析结果与产出必须逐字段相等，多一个字段就是漂移。
    assert.deepEqual(result.data, record, `${table} 的 schema 与 creator 产出的字段集合不一致`);
    assert.equal(validateRecord(table, record).ok, true, `${table} 的记录未通过 validateRecord`);
  }
  const settingsResult = settingsSchema.safeParse(settings);
  assert.ok(settingsResult.success, `settingsSchema 拒绝了 createSettings 的产出：${JSON.stringify(settingsResult.error?.issues)}`);
  assert.deepEqual(settingsResult.data, settings, 'settingsSchema 与 createSettings 的字段集合不一致');
  assert.ok(
    settingsSchema.safeParse(learningDeskDomain.global.initial).success,
    'global 的 initial 值必须通过 global schema',
  );
});

test('每个字段（含嵌套）做一次类型扭转必须被拒收', () => {
  for (const [table, record] of RECORDS) {
    for (const { path, value } of twistTargets(record)) {
      const twisted = setAt(record, path, value);
      const where = `${table} ${path.join('.') || '(记录本身)'} = ${JSON.stringify(value)}`;
      assert.equal(
        schemaOf(table).safeParse(twisted).success,
        false,
        `${where}：类型扭转后的记录仍被 schema 接受，schema 太松`,
      );
      assert.equal(validateRecord(table, twisted).ok, false, `${where}：类型扭转后的记录通过了 validateRecord`);
    }
  }
  const twistedSettings = setAt(settings, ['termStartDate'], 12345);
  assert.equal(settingsSchema.safeParse(twistedSettings).success, false, 'settings.termStartDate 必须是字符串或 null');
  assert.equal(settingsSchema.safeParse(null).success, false, 'global schema 不能接受 null');
});

test('已归档的四条类型漂移全部被拒收', () => {
  assert.equal(schemaOf('tasks').safeParse({ ...task, priority: 2 }).success, false, 'tasks.priority 必须是字符串枚举');
  assert.equal(schemaOf('focus_records').safeParse({ ...focusRecord, start: '2026-10-12T08:00:00Z' }).success, false, 'focusRecords.start 必须是 epoch 毫秒数字');
  assert.equal(schemaOf('notes').safeParse({ ...note, createdAt: '1700000000000' }).success, false, 'notes.createdAt 必须是 epoch 毫秒数字');
  assert.equal(schemaOf('notes').safeParse({ ...note, updatedAt: '1700000000000' }).success, false, 'notes.updatedAt 必须是 epoch 毫秒数字');
  assert.equal(schemaOf('cards').safeParse({ ...card, due: DAY }).success, false, 'cards.due 必须是 epoch 毫秒数字');
  assert.equal(schemaOf('tasks').safeParse({ ...task, priority: 'urgent' }).success, false, 'tasks.priority 只接受 low | medium | high');
});

test('defineDomain 保留加载期校验', () => {
  assert.deepEqual(domainTable(taskSchema), { valueSchema: taskSchema });
  assert.throws(() => defineDomain({ name: 'learning-desk', version: 1, tables: {} }), /must match/);
  assert.throws(() => defineDomain({ name: learningDeskDomain.name, version: 1, tables: { dayPlans: domainTable(taskSchema) } }), /table name/);
  assert.throws(() => defineDomain({ name: 'learning_desk', version: -1, tables: {} }), /version/);
  assert.throws(() => defineDomain({ name: 'learning_desk', version: 1.5, tables: {} }), /version/);
  assert.throws(() => defineDomain({ name: 'learning_desk', version: 2, tables: {}, compatibleVersions: [2] }), /compatibleVersions/);
  assert.throws(() => defineDomain({ name: 'learning_desk', version: 1, tables: {}, layout: 'per_record' }), /layout/);
  assert.throws(() => defineDomain({ name: 'learning_desk', version: 1, tables: {}, invalidRecords: 'skip' }), /invalidRecords/);
  assert.throws(
    () => defineDomain({ name: 'learning_desk', version: 1, tables: {}, global: { schema: z.any(), initial: null } }),
    /global schema must not accept null/,
  );
  assert.doesNotThrow(() => defineDomain({ name: 'learning_desk', version: 1, tables: {} }));
});

/**
 * Cordis 的最小宿主替身：`effect` 注册 effect 体，并返回与真实
 * `ctx.effect(...)` 同形的 thenable（先 settle effect 体，再把 disposer 交出去）。
 * @param {(spec: object) => Promise<object>} [open] 自定义 open 行为
 * @returns {{ctx: object, state: {opens: object[], closes: number, labels: string[], disposers: Function[]}}} 宿主与观测状态
 */
function fakeHost(open) {
  const state = { opens: [], closes: 0, labels: [], disposers: [] };
  const ctx = {
    connection: { fetch: { register: () => () => {} } },
    tools: { register: () => () => {} },
    storageDomain: {
      open: async (spec) => {
        state.opens.push(spec);
        if (open !== undefined) return open(spec);
        return { close: async () => { state.closes += 1; } };
      },
    },
    effect: (execute, label) => {
      state.labels.push(label);
      const body = Promise.resolve(execute());
      let disposed = false;
      const dispose = async () => {
        if (disposed) return;
        disposed = true;
        const disposer = await body;
        if (typeof disposer === 'function') await disposer();
      };
      state.disposers.push(dispose);
      const wrapper = () => dispose();
      wrapper.then = (onFulfilled, onRejected) => body.then(() => dispose).then(onFulfilled, onRejected);
      return wrapper;
    },
  };
  return { ctx, state };
}

test('apply 真正打开 domain，并在卸载时关闭', async () => {
  const { ctx, state } = fakeHost();
  assert.deepEqual(inject, ['storageDomain', 'connection', 'tools']);
  await apply(ctx, {});
  assert.equal(state.opens.length, 2, 'apply opens learning data and timer metadata');
  assert.equal(state.opens[0], learningDeskDomain, 'apply 必须打开 learningDeskDomain');
  assert.ok(state.labels.includes('learning-desk: storage domain'));
  assert.ok(state.labels.includes('learning-desk: API'));
  assert.equal(state.labels.filter(label => label.includes('learning_desk_')).length, 4);
  assert.equal(state.closes, 0, '打开成功时不应立即关闭');
  await state.disposers[0]();
  assert.equal(state.closes, 2, 'effect disposer closes both domains');
  await state.disposers[0]();
  assert.equal(state.closes, 2, 'repeated unload does not close twice');
});

test('open 失败时 apply 拒绝（fail loud）', async () => {
  const { ctx } = fakeHost(async () => {
    throw new Error('version-mismatch');
  });
  await assert.rejects(() => apply(ctx, {}), /version-mismatch/);
});
