/**
 * 每日日程合成（规格 §4.2）：把课表命中项、待排任务与用户覆盖合成一条可渲染的时间轴。
 *
 * 六步规则的实现映射：
 * 1. `fixed` 收集命中该日期的全部课表条目；
 * 2. 待排任务 = `date === dateStr` 的未完成项 ∪ `date` 为空且 `status === 'todo'` 的项，
 *    按 priority → order → 入参顺序取用；
 * 3. 空闲区间 = `[dayStart, dayEnd)` 减去固定块、覆盖块与已移动的块；
 * 4. 依次按 `estimateMin` 填入最早可用空闲区间，放不下则进 `overflow`；
 * 5. 不足 `MIN_BLOCK_MIN`（15 分钟）的空闲碎片不作为投放目标（`freeMinutes` 仍然计入这些碎片）；
 * 6. 叠加用户覆盖：被删除的块不复活，被移动的块保持新位置。
 *
 * 时间轴以「日窗口起点」为原点用绝对分钟表示：`dayEnd <= dayStart` 表示窗口跨天
 * （如 `20:00`–`02:00`），窗口内时刻统一映射到 `[dayStartMin, dayStartMin + 1440)`。
 * 每个块同时给出 `start`/`end`（`HH:mm` 墙钟）与 `startMin`/`endMin`（绝对分钟，用于排序）。
 *
 * 覆盖块（`overrides`）的形状：
 * - `{ id, type: 'remove', refId }` 删除块 `refId`；
 * - `{ id, type: 'move', refId, start, end }` 把块 `refId` 移到 `[start, end)`；
 * - `{ id, type: 'add', title, start, end }` 新增一个自定义块。
 * 块 id 约定：课表块 `c:<courseId>`、任务块 `t:<taskId>`、自定义块 `u:<overrideId>`。
 *
 * @module domain/schedule
 */

import { coursesOn } from './term-weeks.js';

const SCH_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SCH_MINUTES_PER_DAY = 1440;
const SCH_MIN_BLOCK_MIN = 15;
const SCH_OVERRIDE_TYPES = ['remove', 'move', 'add'];
const SCH_PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };

/**
 * 抛出字段级错误。
 * @param {string} message 错误说明
 * @returns {void}
 */
function schFail(message) {
  throw new Error(`[learning-desk] composeDayPlan：${message}`);
}

/**
 * `HH:mm` → 当日分钟数。
 * @param {string} field 字段路径
 * @param {*} value 原值
 * @returns {number} 0..1439
 */
function schTimeToMinutes(field, value) {
  if (typeof value !== 'string' || !SCH_TIME_RE.test(value)) {
    schFail(`${field} 必须是 'HH:mm' 时刻，收到 ${JSON.stringify(value)}`);
  }
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

/**
 * 当日分钟数 → `HH:mm`（对 24 小时取模）。
 * @param {number} minutes 绝对分钟数
 * @returns {string} `HH:mm`
 */
function schFormatTime(minutes) {
  const normalized = ((minutes % SCH_MINUTES_PER_DAY) + SCH_MINUTES_PER_DAY) % SCH_MINUTES_PER_DAY;
  const hh = String(Math.floor(normalized / 60)).padStart(2, '0');
  const mm = String(normalized % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * 把 `[start, end)` 映射到日窗口的绝对分钟区间；跨天窗口下若区间属于次日则整体后移一天。
 * @param {string} field 字段前缀
 * @param {*} start 开始时刻 `HH:mm`
 * @param {*} end 结束时刻 `HH:mm`
 * @param {number} windowStart 窗口起始绝对分钟
 * @param {number} windowEnd 窗口结束绝对分钟
 * @returns {{startMin: number, endMin: number}} 绝对分钟区间
 */
function schPlace(field, start, end, windowStart, windowEnd) {
  const startOfDay = schTimeToMinutes(`${field}.start`, start);
  const endOfDay = schTimeToMinutes(`${field}.end`, end);
  let startMin = startOfDay;
  let endMin = endOfDay <= startOfDay ? endOfDay + SCH_MINUTES_PER_DAY : endOfDay;
  if (startMin < windowStart && startMin + SCH_MINUTES_PER_DAY <= windowEnd) {
    startMin += SCH_MINUTES_PER_DAY;
    endMin += SCH_MINUTES_PER_DAY;
  }
  return { startMin, endMin };
}

/**
 * 把绝对分钟区间裁剪到窗口内。
 * @param {number} startMin 区间起点
 * @param {number} endMin 区间终点
 * @param {number} windowStart 窗口起点
 * @param {number} windowEnd 窗口终点
 * @returns {number[]|null} 裁剪后的 `[start, end)`，无交集时 null
 */
function schClip(startMin, endMin, windowStart, windowEnd) {
  const start = Math.max(startMin, windowStart);
  const end = Math.min(endMin, windowEnd);
  return end > start ? [start, end] : null;
}

/**
 * 合并重叠区间。
 * @param {number[][]} intervals 区间列表
 * @returns {number[][]} 升序且互不重叠的区间列表
 */
function schMerge(intervals) {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [start, end] of sorted) {
    if (end <= start) {
      continue;
    }
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/**
 * 取窗口内的空闲区间。
 * @param {number[][]} occupied 已占用区间
 * @param {number} windowStart 窗口起点
 * @param {number} windowEnd 窗口终点
 * @returns {number[][]} 空闲区间列表
 */
function schFree(occupied, windowStart, windowEnd) {
  const merged = schMerge(occupied);
  const free = [];
  let cursor = windowStart;
  for (const [start, end] of merged) {
    if (start > cursor) {
      free.push([cursor, start]);
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < windowEnd) {
    free.push([cursor, windowEnd]);
  }
  return free;
}

/**
 * 组装一个时间轴块。
 * @param {string} kind 块类型：course | task | custom
 * @param {string} id 块 id
 * @param {string} refId 源实体 id
 * @param {string} title 展示标题
 * @param {number} startMin 绝对起分钟
 * @param {number} endMin 绝对止分钟
 * @param {boolean} moved 是否来自 move 覆盖
 * @returns {object} 时间轴块
 */
function schBlock(kind, id, refId, title, startMin, endMin, moved) {
  return {
    id,
    kind,
    refId,
    title,
    start: schFormatTime(startMin),
    end: schFormatTime(endMin),
    startMin,
    endMin,
    minutes: endMin - startMin,
    moved,
  };
}

/**
 * 判定任务是否属于该日的待排集合。
 * @param {object} task 任务
 * @param {string} dateStr 目标日期
 * @returns {boolean} 待排为 true
 */
function schIsPending(task, dateStr) {
  if (task === null || typeof task !== 'object') {
    return false;
  }
  if (task.status === 'done') {
    return false;
  }
  if (typeof task.date === 'string' && task.date.length > 0) {
    return task.date === dateStr;
  }
  return task.status === 'todo';
}

/**
 * 任务的预估时长（分钟），非法或缺失按 0 处理。
 * @param {object} task 任务
 * @returns {number} 分钟
 */
function schEstimate(task) {
  const value = task.estimateMin;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 解析并校验覆盖项。
 * @param {object[]} overrides 覆盖项数组
 * @param {number} windowStart 窗口起点
 * @param {number} windowEnd 窗口终点
 * @returns {{removed: Set<string>, moved: Map<string, {startMin: number, endMin: number}>, added: object[]}} 覆盖结果
 */
function schReadOverrides(overrides, windowStart, windowEnd) {
  const removed = new Set();
  const moved = new Map();
  const added = [];
  overrides.forEach((override, index) => {
    const at = `overrides[${index}]`;
    if (override === null || typeof override !== 'object' || Array.isArray(override)) {
      schFail(`${at} 必须是对象`);
    }
    if (!SCH_OVERRIDE_TYPES.includes(override.type)) {
      schFail(`${at}.type 必须是 ${SCH_OVERRIDE_TYPES.join(' | ')} 之一，收到 ${JSON.stringify(override.type)}`);
    }
    if (typeof override.id !== 'string' || override.id.length === 0) {
      schFail(`${at}.id 必须是非空字符串`);
    }
    if (override.type === 'remove' || override.type === 'move') {
      if (typeof override.refId !== 'string' || override.refId.length === 0) {
        schFail(`${at}.refId 必须是非空字符串`);
      }
    }
    if (override.type === 'remove') {
      removed.add(override.refId);
      return;
    }
    const place = schPlace(at, override.start, override.end, windowStart, windowEnd);
    if (override.type === 'move') {
      moved.set(override.refId, place);
      return;
    }
    if (typeof override.title !== 'string' || override.title.length === 0) {
      schFail(`${at}.title 必须是非空字符串`);
    }
    added.push({ id: override.id, title: override.title, startMin: place.startMin, endMin: place.endMin });
  });
  return { removed, moved, added };
}

/**
 * 合成某一天的日程计划（纯函数：不改写入参、不读时钟、不生成随机数）。
 *
 * 返回的块统一带 `{ id, kind, refId, title, start, end, startMin, endMin, minutes, moved }`；
 * 课表块额外带 `location` / `color`，任务块额外带 `courseId` / `estimateMin`。
 * `fixed` 与 `scheduled` 按 `startMin` 升序；`overflow` 装未排下的任务**原对象引用**。
 *
 * @param {object} input 入参
 * @param {string} input.dateStr 目标日期 `YYYY-MM-DD`
 * @param {string} input.dayStart 日窗口起点 `HH:mm`
 * @param {string} input.dayEnd 日窗口终点 `HH:mm`；小于起点表示跨天，等于起点表示整天 24 小时
 * @param {object[]} [input.courses] 全部课表条目
 * @param {object[]} [input.tasks] 全部任务
 * @param {object[]} [input.overrides] 用户覆盖项
 * @param {string} input.termStartDateStr 学期起始日 `YYYY-MM-DD`
 * @returns {{fixed: object[], scheduled: object[], overflow: object[], freeMinutes: number}} 当日计划
 */
export function composeDayPlan(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    schFail('入参必须是普通对象');
  }
  const { dateStr, dayStart, dayEnd, termStartDateStr } = input;
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    schFail(`dateStr 必须是 'YYYY-MM-DD' 字符串，收到 ${JSON.stringify(dateStr)}`);
  }
  const courses = input.courses === undefined || input.courses === null ? [] : input.courses;
  const tasks = input.tasks === undefined || input.tasks === null ? [] : input.tasks;
  const overrides = input.overrides === undefined || input.overrides === null ? [] : input.overrides;
  if (!Array.isArray(courses)) {
    schFail('courses 必须是数组');
  }
  if (!Array.isArray(tasks)) {
    schFail('tasks 必须是数组');
  }
  if (!Array.isArray(overrides)) {
    schFail('overrides 必须是数组');
  }

  const windowStart = schTimeToMinutes('dayStart', dayStart);
  const endOfDay = schTimeToMinutes('dayEnd', dayEnd);
  const windowEnd = endOfDay > windowStart ? endOfDay : endOfDay + SCH_MINUTES_PER_DAY;

  const { removed, moved, added } = schReadOverrides(overrides, windowStart, windowEnd);

  const fixed = [];
  const scheduled = [];
  const overflow = [];

  // 第 1 步：命中该日期的课表条目（含跨天窗口的次日部分）。
  for (const course of coursesOn(dateStr, courses, termStartDateStr)) {
    const refId = course.id === undefined || course.id === null ? '' : String(course.id);
    const id = `c:${refId}`;
    if (removed.has(id)) {
      continue;
    }
    const override = moved.get(id);
    const place = override || schPlace(`course ${refId}`, course.start, course.end, windowStart, windowEnd);
    const block = schBlock(
      'course',
      id,
      refId,
      typeof course.name === 'string' ? course.name : '',
      place.startMin,
      place.endMin,
      override !== undefined,
    );
    block.location = typeof course.location === 'string' ? course.location : '';
    block.color = typeof course.color === 'string' ? course.color : '';
    fixed.push(block);
  }

  // 第 6 步（前半）：自定义块是用户显式放置的固定块。
  for (const item of added) {
    const id = `u:${item.id}`;
    if (removed.has(id)) {
      continue;
    }
    fixed.push(schBlock('custom', id, item.id, item.title, item.startMin, item.endMin, false));
  }

  // 第 2 步：待排任务；已移动的块直接落位，避免二次排程。
  const pending = [];
  tasks.forEach((task, index) => {
    if (!schIsPending(task, dateStr)) {
      return;
    }
    const refId = task.id === undefined || task.id === null ? '' : String(task.id);
    const id = `t:${refId}`;
    if (removed.has(id)) {
      return;
    }
    const override = moved.get(id);
    if (override) {
      scheduled.push(
        schBlock('task', id, refId, typeof task.title === 'string' ? task.title : '', override.startMin, override.endMin, true),
      );
      return;
    }
    pending.push({ task, refId, index, weight: SCH_PRIORITY_WEIGHT[task.priority] || 0 });
  });
  pending.sort((a, b) => b.weight - a.weight || (a.task.order || 0) - (b.task.order || 0) || a.index - b.index);

  // 第 3 步：空闲区间 = 窗口 − 固定块 − 已落位块。
  const occupied = [];
  for (const block of fixed.concat(scheduled)) {
    const clipped = schClip(block.startMin, block.endMin, windowStart, windowEnd);
    if (clipped) {
      occupied.push(clipped);
    }
  }
  const free = schFree(occupied, windowStart, windowEnd);

  // 第 4、5 步：按序填入空闲区间；不足 15 分钟的碎片不作为投放目标。
  for (const item of pending) {
    const need = schEstimate(item.task);
    let placed = false;
    for (const interval of free) {
      const remaining = interval[1] - interval[0];
      if (remaining < SCH_MIN_BLOCK_MIN || remaining < need) {
        continue;
      }
      const startMin = interval[0];
      const block = schBlock(
        'task',
        `t:${item.refId}`,
        item.refId,
        typeof item.task.title === 'string' ? item.task.title : '',
        startMin,
        startMin + need,
        false,
      );
      block.courseId = item.task.courseId === undefined ? null : item.task.courseId;
      block.estimateMin = need;
      scheduled.push(block);
      interval[0] = startMin + need;
      placed = true;
      break;
    }
    if (!placed) {
      overflow.push(item.task);
    }
  }

  const byStart = (a, b) => a.startMin - b.startMin || a.endMin - b.endMin || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  fixed.sort(byStart);
  scheduled.sort(byStart);
  const freeMinutes = free.reduce((total, interval) => total + (interval[1] - interval[0]), 0);

  return { fixed, scheduled, overflow, freeMinutes };
}
