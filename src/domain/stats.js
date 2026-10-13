/**
 * 统计聚合：连续天数、热力图、标签时长分布、完成率。
 *
 * 打卡不落库：连续天数由 `FocusRecord` 实时派生（规格 §3.1）。
 * epoch 毫秒按 **UTC 日** 切分（`floor(ms / 86400000)`），与运行机器的时区无关；
 * 调用方写入 epoch 时需保证其与自己的日期口径一致。
 *
 * 容错策略：单条记录字段非法时跳过该记录而不是抛错（统计页不能因为一条脏数据整页空白），
 * 只有函数级参数（`todayStr` / `endDateStr` / 区间的合法性）不会导致空结果时才抛错。
 *
 * @module domain/stats
 */

const ST_DAY_MS = 86400000;
const ST_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 抛出参数级错误。
 * @param {string} name 函数名
 * @param {string} message 错误说明
 * @returns {void}
 */
function stFail(name, message) {
  throw new Error(`[learning-desk] ${name}：${message}`);
}

/**
 * 校验日期字符串并返回 epoch 日序。
 * @param {string} name 函数名
 * @param {string} value 日期字符串
 * @returns {number} epoch 日序
 */
function stDayFromString(name, value) {
  if (typeof value !== 'string' || !ST_DATE_RE.test(value)) {
    stFail(name, `日期必须是 'YYYY-MM-DD' 字符串，收到 ${JSON.stringify(value)}`);
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const days = stDaysFromCivil(year, month, day);
  if (stFormatDay(days) !== value) {
    stFail(name, `日期不存在：${value}`);
  }
  return days;
}

/**
 * 宽松解析日期：非法或无日期返回 null，用于逐条数据（脏数据只跳过该条）。
 * @param {*} value 原值
 * @returns {number|null} epoch 日序
 */
function stTryDay(value) {
  if (typeof value !== 'string' || !ST_DATE_RE.test(value)) {
    return null;
  }
  const days = stDaysFromCivil(Number(value.slice(0, 4)), Number(value.slice(5, 7)), Number(value.slice(8, 10)));
  return stFormatDay(days) === value ? days : null;
}

/**
 * 公历日期 → epoch 日序（Howard Hinnant 的 days_from_civil）。
 * @param {number} year 年
 * @param {number} month 月
 * @param {number} day 日
 * @returns {number} epoch 日序
 */
function stDaysFromCivil(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * epoch 日序 → `[year, month, day]`（Howard Hinnant 的 civil_from_days）。
 * @param {number} dayNumber epoch 日序
 * @returns {number[]} `[年, 月, 日]`
 */
function stCivilFromDays(dayNumber) {
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return [y + (month <= 2 ? 1 : 0), month, day];
}

/**
 * epoch 日序 → `YYYY-MM-DD`。
 * @param {number} dayNumber epoch 日序
 * @returns {string} 日期字符串
 */
function stFormatDay(dayNumber) {
  const [year, month, day] = stCivilFromDays(dayNumber);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 记录是否计入统计。
 * @param {object} record 专注记录
 * @returns {boolean} 计入为 true
 */
function stCounts(record) {
  return record !== null && typeof record === 'object' && !Array.isArray(record) && record.completed !== false;
}

/**
 * 记录时长（分钟），非法按 0。
 * @param {object} record 专注记录
 * @returns {number} 分钟
 */
function stMinutes(record) {
  const value = record.durationMin;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 按 UTC 日汇总时长。
 * @param {object[]} records 专注记录
 * @returns {Map<number, number>} epoch 日序 → 分钟
 */
function stMinutesByDay(records) {
  const byDay = new Map();
  for (const record of records) {
    if (!stCounts(record)) {
      continue;
    }
    const start = record.start;
    if (typeof start !== 'number' || !Number.isFinite(start) || start < 0) {
      continue;
    }
    const day = Math.floor(start / ST_DAY_MS);
    byDay.set(day, (byDay.get(day) ?? 0) + stMinutes(record));
  }
  return byDay;
}

/**
 * 连续达标天数：从 `todayStr`（当天未达标则从昨天）向前数，直到某天未达标为止。
 * 当天未达标不打断历史连续，因此「昨天已达标、今天还没学」仍然返回昨天的连续天数。
 * @param {object[]} records 全部专注记录
 * @param {string} todayStr 今天 `YYYY-MM-DD`
 * @param {number} dailyGoalMin 每日目标分钟数；为 0 时按「当天有记录即达标」处理
 * @returns {number} 连续达标天数
 */
export function streakDays(records, todayStr, dailyGoalMin) {
  const name = 'streakDays';
  if (!Array.isArray(records)) {
    stFail(name, 'records 必须是数组');
  }
  if (typeof dailyGoalMin !== 'number' || !Number.isFinite(dailyGoalMin) || dailyGoalMin < 0) {
    stFail(name, `dailyGoalMin 必须是非负有限数字，收到 ${JSON.stringify(dailyGoalMin)}`);
  }
  let today = stDayFromString(name, todayStr);
  const byDay = stMinutesByDay(records);
  const met = (minutes) => (dailyGoalMin > 0 ? minutes >= dailyGoalMin : minutes > 0);

  if (!met(byDay.get(today) ?? 0)) {
    today -= 1;
  }
  let streak = 0;
  while (met(byDay.get(today) ?? 0)) {
    streak += 1;
    today -= 1;
  }
  return streak;
}

/**
 * 热力图数据：以 `endDateStr` 结束、长度为 `weeks * 7` 天的连续日期序列。
 * @param {object[]} records 全部专注记录
 * @param {string} endDateStr 结束日期 `YYYY-MM-DD`（含）
 * @param {number} weeks 周数（正整数）
 * @returns {{date: string, minutes: number}[]} 升序日期序列，缺失日期补 0
 */
export function heatmap(records, endDateStr, weeks) {
  const name = 'heatmap';
  if (!Array.isArray(records)) {
    stFail(name, 'records 必须是数组');
  }
  if (!Number.isInteger(weeks) || weeks < 1) {
    stFail(name, `weeks 必须是 ≥ 1 的整数，收到 ${JSON.stringify(weeks)}`);
  }
  const end = stDayFromString(name, endDateStr);
  const byDay = stMinutesByDay(records);
  const days = weeks * 7;
  const cells = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = end - offset;
    cells.push({ date: stFormatDay(day), minutes: byDay.get(day) ?? 0 });
  }
  return cells;
}

/**
 * 按标签汇总时长：把记录时长累加到其关联任务的每个标签上（多标签记录会被重复计入每个标签）。
 * 记录没有可解析的任务或任务没有标签时不参与汇总。
 * @param {object[]} records 全部专注记录
 * @param {object[]} tasks 全部任务
 * @returns {Record<string, number>} 标签 → 分钟
 */
export function minutesByTag(records, tasks) {
  const name = 'minutesByTag';
  if (!Array.isArray(records)) {
    stFail(name, 'records 必须是数组');
  }
  if (!Array.isArray(tasks)) {
    stFail(name, 'tasks 必须是数组');
  }
  const tagsByTask = new Map();
  for (const task of tasks) {
    if (task === null || typeof task !== 'object' || typeof task.id !== 'string') {
      continue;
    }
    const tags = Array.isArray(task.tags) ? task.tags.filter((tag) => typeof tag === 'string' && tag.length > 0) : [];
    tagsByTask.set(task.id, tags);
  }
  const totals = Object.create(null);
  for (const record of records) {
    if (!stCounts(record)) {
      continue;
    }
    const tags = tagsByTask.get(record.taskId);
    if (!tags || tags.length === 0) {
      continue;
    }
    const minutes = stMinutes(record);
    for (const tag of tags) {
      totals[tag] = (totals[tag] ?? 0) + minutes;
    }
  }
  return { ...totals };
}

/**
 * 完成率：`date` 落在 `[fromStr, toStr]`（含端点）内的任务中 `status === 'done'` 的占比。
 * @param {object[]} tasks 全部任务
 * @param {string} fromStr 起始日期 `YYYY-MM-DD`
 * @param {string} toStr 结束日期 `YYYY-MM-DD`
 * @returns {number} 0..1 的占比；区间内没有任务时返回 0
 */
export function completionRate(tasks, fromStr, toStr) {
  const name = 'completionRate';
  if (!Array.isArray(tasks)) {
    stFail(name, 'tasks 必须是数组');
  }
  const from = stDayFromString(name, fromStr);
  const to = stDayFromString(name, toStr);
  if (to < from) {
    stFail(name, `toStr（${toStr}）不能早于 fromStr（${fromStr}）`);
  }
  let total = 0;
  let done = 0;
  for (const task of tasks) {
    if (task === null || typeof task !== 'object') {
      continue;
    }
    const day = stTryDay(task.date);
    if (day === null || day < from || day > to) {
      continue;
    }
    total += 1;
    if (task.status === 'done') {
      done += 1;
    }
  }
  return total === 0 ? 0 : done / total;
}
