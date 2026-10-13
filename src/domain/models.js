/**
 * 实体构造与校验：把 UI 表单、storage 反序列化结果、Agent 工具入参规范化成
 * 带默认值的普通对象（规格 §3 数据模型）。
 *
 * 约定：
 * - 日期一律 `YYYY-MM-DD`，时刻一律 `HH:mm`，时间戳一律 epoch 毫秒数字；本模块
 *   既不产生也不接收 `Date` 对象。
 * - 每个 creator 形如 `createX({ id, ...fields })`：不读时钟、不生成随机 id，
 *   `id` 必须由调用方注入。
 * - 未知字段被忽略；非法字段抛出带创建器名与字段路径的 `Error`。
 *
 * @module domain/models
 */

const MDL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MDL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MDL_PARITIES = ['all', 'odd', 'even'];
const MDL_TASK_STATUSES = ['todo', 'doing', 'done'];
const MDL_PRIORITIES = ['low', 'medium', 'high'];
const MDL_FOCUS_MODES = ['pomodoro', 'countup', 'break'];
const MDL_RESOURCE_KINDS = ['link', 'book', 'course', 'video'];
const MDL_RESOURCE_STATUSES = ['unread', 'reading', 'done'];
const MDL_THEMES = ['system', 'light', 'dark'];

/**
 * 抛出带创建器名的字段级错误。
 * @param {string} creator 创建器名
 * @param {string} message 错误说明
 * @returns {void}
 */
function mdlFail(creator, message) {
  throw new Error(`[learning-desk] ${creator}：${message}`);
}

/**
 * 校验入参是普通对象。
 * @param {string} creator 创建器名
 * @param {*} input 原始入参
 * @returns {object} 同一入参（只读使用）
 */
function mdlObject(creator, input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    mdlFail(creator, '入参必须是普通对象');
  }
  return input;
}

/**
 * 取出必填的非空字符串 id。
 * @param {string} creator 创建器名
 * @param {object} input 原始入参
 * @returns {string} id
 */
function mdlId(creator, input) {
  const { id } = input;
  if (typeof id !== 'string' || id.length === 0) {
    mdlFail(creator, 'id 必须是非空字符串');
  }
  return id;
}

/**
 * 校验字符串字段。
 * @param {string} creator 创建器名
 * @param {string} field 字段路径
 * @param {*} value 原值
 * @param {{required?: boolean, fallback?: string, allowEmpty?: boolean, pattern?: RegExp, patternHint?: string}} [options] 约束
 * @returns {string} 规范化后的字符串
 */
function mdlString(creator, field, value, options) {
  const opts = options || {};
  const { required = false, fallback = '', allowEmpty = true, pattern, patternHint } = opts;
  if (value === undefined || value === null) {
    if (required) {
      mdlFail(creator, `${field} 必填`);
    }
    return fallback;
  }
  if (typeof value !== 'string') {
    mdlFail(creator, `${field} 必须是字符串，收到 ${JSON.stringify(value)}`);
  }
  if (!allowEmpty && value.length === 0) {
    mdlFail(creator, `${field} 不能为空字符串`);
  }
  if (pattern && !pattern.test(value)) {
    mdlFail(creator, `${field} 格式非法（期望 ${patternHint}），收到 ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * 校验数字字段。
 * @param {string} creator 创建器名
 * @param {string} field 字段路径
 * @param {*} value 原值
 * @param {{required?: boolean, fallback?: number, min?: number, max?: number, integer?: boolean}} [options] 约束
 * @returns {number} 校验后的数字
 */
function mdlNumber(creator, field, value, options) {
  const opts = options || {};
  const { required = false, fallback = 0, min = -Infinity, max = Infinity, integer = false } = opts;
  if (value === undefined || value === null) {
    if (required) {
      mdlFail(creator, `${field} 必填`);
    }
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    mdlFail(creator, `${field} 必须是有限数字，收到 ${JSON.stringify(value)}`);
  }
  if (integer && !Number.isInteger(value)) {
    mdlFail(creator, `${field} 必须是整数，收到 ${value}`);
  }
  if (value < min || value > max) {
    mdlFail(creator, `${field} 必须落在 [${min}, ${max}]，收到 ${value}`);
  }
  return value;
}

/**
 * 校验可空日期字段。
 * @param {string} creator 创建器名
 * @param {string} field 字段路径
 * @param {*} value 原值
 * @returns {string|null} `YYYY-MM-DD` 或 null
 */
function mdlDateOrNull(creator, field, value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return mdlString(creator, field, value, { pattern: MDL_DATE_RE, patternHint: 'YYYY-MM-DD' });
}

/**
 * 校验时刻字段。
 * @param {string} creator 创建器名
 * @param {string} field 字段路径
 * @param {*} value 原值
 * @param {boolean} required 是否必填
 * @returns {string} `HH:mm`
 */
function mdlTime(creator, field, value, required) {
  return mdlString(creator, field, value, {
    required,
    allowEmpty: false,
    pattern: MDL_TIME_RE,
    patternHint: 'HH:mm（24 小时制）',
  });
}

/**
 * 校验枚举字段。
 * @param {string} creator 创建器名
 * @param {string} field 字段路径
 * @param {*} value 原值
 * @param {string[]} allowed 允许取值
 * @param {string} fallback 缺省值
 * @returns {string} 命中的枚举值
 */
function mdlEnum(creator, field, value, allowed, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (!allowed.includes(value)) {
    mdlFail(creator, `${field} 必须是 ${allowed.join(' | ')} 之一，收到 ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * 校验字符串数组并去重（保持首次出现顺序）。
 * @param {string} creator 创建器名
 * @param {string} field 字段路径
 * @param {*} value 原值
 * @returns {string[]} 规范化后的数组
 */
function mdlStringList(creator, field, value) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    mdlFail(creator, `${field} 必须是字符串数组`);
  }
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0) {
      mdlFail(creator, `${field} 的元素必须是非空字符串，收到 ${JSON.stringify(item)}`);
    }
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/**
 * 校验可空 id 字段。
 * @param {string} creator 创建器名
 * @param {string} field 字段路径
 * @param {*} value 原值
 * @returns {string|null} id 或 null
 */
function mdlIdOrNull(creator, field, value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    mdlFail(creator, `${field} 必须是非空字符串或 null`);
  }
  return value;
}

/**
 * 校验周次规则，缺省为整学期 `{ from: 1, to: 16, parity: 'all' }`。
 * @param {string} creator 创建器名
 * @param {*} value 原值
 * @returns {{from: number, to: number, parity: 'all'|'odd'|'even'}} 周次规则
 */
function mdlWeeks(creator, value) {
  if (value === undefined || value === null) {
    return { from: 1, to: 16, parity: 'all' };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    mdlFail(creator, 'weeks 必须是对象 { from, to, parity }');
  }
  const from = mdlNumber(creator, 'weeks.from', value.from, { integer: true, min: 1, fallback: 1 });
  const to = mdlNumber(creator, 'weeks.to', value.to, { integer: true, min: 1, fallback: 16 });
  if (to < from) {
    mdlFail(creator, `weeks.to（${to}）不能小于 weeks.from（${from}）`);
  }
  const parity = mdlEnum(creator, 'weeks.parity', value.parity, MDL_PARITIES, 'all');
  return { from, to, parity };
}

/**
 * 校验子任务数组并补齐默认值。
 * @param {string} creator 创建器名
 * @param {string} taskId 所属任务 id（用于补子任务 id）
 * @param {*} value 原值
 * @returns {{id: string, title: string, done: boolean}[]} 子任务列表
 */
function mdlSubtasks(creator, taskId, value) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    mdlFail(creator, 'subtasks 必须是数组');
  }
  return value.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      mdlFail(creator, `subtasks[${index}] 必须是对象`);
    }
    const id = mdlString(creator, `subtasks[${index}].id`, item.id, { fallback: `${taskId}:s${index}` });
    if (id.length === 0) {
      mdlFail(creator, `subtasks[${index}].id 不能为空字符串`);
    }
    const title = mdlString(creator, `subtasks[${index}].title`, item.title, { required: true, allowEmpty: false });
    let done = false;
    if (item.done !== undefined && item.done !== null) {
      if (typeof item.done !== 'boolean') {
        mdlFail(creator, `subtasks[${index}].done 必须是布尔值，收到 ${JSON.stringify(item.done)}`);
      }
      done = item.done;
    }
    return { id, title, done };
  });
}

/**
 * 创建课表条目。
 * @param {object} input 入参
 * @param {string} input.id 稳定唯一 id，由调用方注入
 * @param {string} input.name 课程名（非空）
 * @param {string} [input.teacher] 教师，默认 ''
 * @param {string} [input.location] 地点，默认 ''
 * @param {number} input.weekday 星期，1=周一 … 7=周日
 * @param {string} input.start 开始时刻 `HH:mm`
 * @param {string} input.end 结束时刻 `HH:mm`；小于 `start` 表示跨天
 * @param {{from?: number, to?: number, parity?: 'all'|'odd'|'even'}} [input.weeks] 周次，默认 `{from:1,to:16,parity:'all'}`
 * @param {string} [input.color] 颜色标识，默认 ''
 * @param {string} [input.note] 备注，默认 ''
 * @returns {{id: string, name: string, teacher: string, location: string, weekday: number, start: string, end: string, weeks: {from: number, to: number, parity: string}, color: string, note: string}} Course
 */
export function createCourse(input) {
  const creator = 'createCourse';
  const raw = mdlObject(creator, input);
  return {
    id: mdlId(creator, raw),
    name: mdlString(creator, 'name', raw.name, { required: true, allowEmpty: false }),
    teacher: mdlString(creator, 'teacher', raw.teacher, {}),
    location: mdlString(creator, 'location', raw.location, {}),
    weekday: mdlNumber(creator, 'weekday', raw.weekday, { required: true, integer: true, min: 1, max: 7 }),
    start: mdlTime(creator, 'start', raw.start, true),
    end: mdlTime(creator, 'end', raw.end, true),
    weeks: mdlWeeks(creator, raw.weeks),
    color: mdlString(creator, 'color', raw.color, {}),
    note: mdlString(creator, 'note', raw.note, {}),
  };
}

/**
 * 创建任务。
 * @param {object} input 入参
 * @param {string} input.id 稳定唯一 id，由调用方注入
 * @param {string} input.title 标题（非空）
 * @param {string|null} [input.courseId] 归属课程，默认 null
 * @param {string|null} [input.date] 计划日期 `YYYY-MM-DD`，null = 待排池
 * @param {number} [input.estimateMin] 预估时长（分钟），默认 30
 * @param {number} [input.spentMin] 已投入时长（分钟），默认 0
 * @param {'todo'|'doing'|'done'} [input.status] 状态，默认 'todo'
 * @param {'low'|'medium'|'high'} [input.priority] 优先级，默认 'medium'
 * @param {string[]} [input.tags] 标签，默认 []
 * @param {{id?: string, title: string, done?: boolean}[]} [input.subtasks] 子任务，默认 []
 * @param {number} [input.order] 同优先级内的排序权重，默认 0
 * @returns {{id: string, title: string, courseId: string|null, date: string|null, estimateMin: number, spentMin: number, status: string, priority: string, tags: string[], subtasks: {id: string, title: string, done: boolean}[], order: number}} Task
 */
export function createTask(input) {
  const creator = 'createTask';
  const raw = mdlObject(creator, input);
  const id = mdlId(creator, raw);
  return {
    id,
    title: mdlString(creator, 'title', raw.title, { required: true, allowEmpty: false }),
    courseId: mdlIdOrNull(creator, 'courseId', raw.courseId),
    date: mdlDateOrNull(creator, 'date', raw.date),
    estimateMin: mdlNumber(creator, 'estimateMin', raw.estimateMin, { min: 0, fallback: 30 }),
    spentMin: mdlNumber(creator, 'spentMin', raw.spentMin, { min: 0, fallback: 0 }),
    status: mdlEnum(creator, 'status', raw.status, MDL_TASK_STATUSES, 'todo'),
    priority: mdlEnum(creator, 'priority', raw.priority, MDL_PRIORITIES, 'medium'),
    tags: mdlStringList(creator, 'tags', raw.tags),
    subtasks: mdlSubtasks(creator, id, raw.subtasks),
    order: mdlNumber(creator, 'order', raw.order, { fallback: 0 }),
  };
}

/**
 * 创建专注记录（打卡与统计的唯一原始数据源）。
 * @param {object} input 入参
 * @param {string} input.id 稳定唯一 id，由调用方注入
 * @param {string|null} [input.taskId] 关联任务，默认 null
 * @param {string|null} [input.courseId] 关联课程，默认 null
 * @param {number} input.start 开始时刻（epoch 毫秒）
 * @param {number} input.durationMin 实际时长（分钟，≥ 0）
 * @param {'pomodoro'|'countup'|'break'} [input.mode] 计时模式，默认 'pomodoro'
 * @param {boolean} [input.completed] 是否完整完成，默认 true
 * @returns {{id: string, taskId: string|null, courseId: string|null, start: number, durationMin: number, mode: string, completed: boolean}} FocusRecord
 */
export function createFocusRecord(input) {
  const creator = 'createFocusRecord';
  const raw = mdlObject(creator, input);
  let completed = true;
  if (raw.completed !== undefined && raw.completed !== null) {
    if (typeof raw.completed !== 'boolean') {
      mdlFail(creator, `completed 必须是布尔值，收到 ${JSON.stringify(raw.completed)}`);
    }
    completed = raw.completed;
  }
  return {
    id: mdlId(creator, raw),
    taskId: mdlIdOrNull(creator, 'taskId', raw.taskId),
    courseId: mdlIdOrNull(creator, 'courseId', raw.courseId),
    start: mdlNumber(creator, 'start', raw.start, { required: true, min: 0 }),
    durationMin: mdlNumber(creator, 'durationMin', raw.durationMin, { required: true, min: 0 }),
    mode: mdlEnum(creator, 'mode', raw.mode, MDL_FOCUS_MODES, 'pomodoro'),
    completed,
  };
}

/**
 * 创建笔记。
 * @param {object} input 入参
 * @param {string} input.id 稳定唯一 id，由调用方注入
 * @param {string} [input.title] 标题，默认 ''
 * @param {string} [input.markdown] Markdown 正文，默认 ''
 * @param {string[]} [input.tags] 标签，默认 []
 * @param {string[]} [input.linkTaskIds] 关联任务 id，默认 []
 * @param {string[]} [input.linkCourseIds] 关联课程 id，默认 []
 * @param {number} input.createdAt 创建时间（epoch 毫秒），必填
 * @param {number} [input.updatedAt] 更新时间（epoch 毫秒），默认等于 createdAt
 * @returns {{id: string, title: string, markdown: string, tags: string[], linkTaskIds: string[], linkCourseIds: string[], createdAt: number, updatedAt: number}} Note
 */
export function createNote(input) {
  const creator = 'createNote';
  const raw = mdlObject(creator, input);
  const createdAt = mdlNumber(creator, 'createdAt', raw.createdAt, { required: true, min: 0 });
  return {
    id: mdlId(creator, raw),
    title: mdlString(creator, 'title', raw.title, {}),
    markdown: mdlString(creator, 'markdown', raw.markdown, {}),
    tags: mdlStringList(creator, 'tags', raw.tags),
    linkTaskIds: mdlStringList(creator, 'linkTaskIds', raw.linkTaskIds),
    linkCourseIds: mdlStringList(creator, 'linkCourseIds', raw.linkCourseIds),
    createdAt,
    updatedAt: mdlNumber(creator, 'updatedAt', raw.updatedAt, { min: 0, fallback: createdAt }),
  };
}

/**
 * 创建卡片分组。
 * @param {object} input 入参
 * @param {string} input.id 稳定唯一 id，由调用方注入
 * @param {string} input.name 分组名（非空）
 * @param {string|null} [input.courseId] 归属课程，默认 null
 * @param {string} [input.description] 描述，默认 ''
 * @returns {{id: string, name: string, courseId: string|null, description: string}} Deck
 */
export function createDeck(input) {
  const creator = 'createDeck';
  const raw = mdlObject(creator, input);
  return {
    id: mdlId(creator, raw),
    name: mdlString(creator, 'name', raw.name, { required: true, allowEmpty: false }),
    courseId: mdlIdOrNull(creator, 'courseId', raw.courseId),
    description: mdlString(creator, 'description', raw.description, {}),
  };
}

/**
 * 创建资源收藏。
 * @param {object} input 入参
 * @param {string} input.id 稳定唯一 id，由调用方注入
 * @param {string} input.title 标题（非空）
 * @param {string} [input.url] 链接，默认 ''
 * @param {'link'|'book'|'course'|'video'} [input.kind] 资源类型，默认 'link'
 * @param {string[]} [input.tags] 标签，默认 []
 * @param {'unread'|'reading'|'done'} [input.status] 阅读状态，默认 'unread'
 * @param {number} [input.progress] 进度（0..1 的小数），默认 0
 * @param {string} [input.note] 备注，默认 ''
 * @returns {{id: string, title: string, url: string, kind: string, tags: string[], status: string, progress: number, note: string}} Resource
 */
export function createResource(input) {
  const creator = 'createResource';
  const raw = mdlObject(creator, input);
  return {
    id: mdlId(creator, raw),
    title: mdlString(creator, 'title', raw.title, { required: true, allowEmpty: false }),
    url: mdlString(creator, 'url', raw.url, {}),
    kind: mdlEnum(creator, 'kind', raw.kind, MDL_RESOURCE_KINDS, 'link'),
    tags: mdlStringList(creator, 'tags', raw.tags),
    status: mdlEnum(creator, 'status', raw.status, MDL_RESOURCE_STATUSES, 'unread'),
    progress: mdlNumber(creator, 'progress', raw.progress, { min: 0, max: 1, fallback: 0 }),
    note: mdlString(creator, 'note', raw.note, {}),
  };
}

/**
 * 创建设置。
 * @param {object} [input] 入参
 * @param {number} [input.dailyGoalMin] 每日目标时长（分钟），默认 120
 * @param {number} [input.pomodoroMin] 番茄时长（分钟），默认 25
 * @param {number} [input.breakMin] 休息时长（分钟），默认 5
 * @param {number} [input.reviewLimit] 单次复习卡上限，默认 20
 * @param {string|null} [input.termStartDate] 学期起始日 `YYYY-MM-DD`，默认 null（未设置）
 * @param {number} [input.weekStartsOn] 一周起始，1=周一 … 7=周日，默认 1
 * @param {'system'|'light'|'dark'} [input.theme] 主题，默认 'system'
 * @returns {{dailyGoalMin: number, pomodoroMin: number, breakMin: number, reviewLimit: number, termStartDate: string|null, weekStartsOn: number, theme: string}} Settings
 */
export function createSettings(input) {
  const creator = 'createSettings';
  const raw = input === undefined ? {} : mdlObject(creator, input);
  return {
    dailyGoalMin: mdlNumber(creator, 'dailyGoalMin', raw.dailyGoalMin, { min: 0, fallback: 120 }),
    pomodoroMin: mdlNumber(creator, 'pomodoroMin', raw.pomodoroMin, { min: 1, fallback: 25 }),
    breakMin: mdlNumber(creator, 'breakMin', raw.breakMin, { min: 0, fallback: 5 }),
    reviewLimit: mdlNumber(creator, 'reviewLimit', raw.reviewLimit, { min: 1, integer: true, fallback: 20 }),
    termStartDate: mdlDateOrNull(creator, 'termStartDate', raw.termStartDate),
    weekStartsOn: mdlNumber(creator, 'weekStartsOn', raw.weekStartsOn, { integer: true, min: 1, max: 7, fallback: 1 }),
    theme: mdlEnum(creator, 'theme', raw.theme, MDL_THEMES, 'system'),
  };
}
