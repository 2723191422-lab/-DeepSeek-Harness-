/**
 * 间隔重复（SM-2 简化版）：卡片状态推进与到期筛选。
 *
 * 状态字段：
 * - `ease` 难度因子，初始 2.5，下限 1.3；
 * - `intervalDays` 当前间隔（天）；
 * - `due` 下次到期时刻（epoch 毫秒）；
 * - `reps` **连续**答对次数（`again` 归零）；
 * - `lapses` 累计遗忘次数。
 *
 * 推进规则（`prev` 为复习前状态）：
 * | grade | reps | intervalDays | ease |
 * | --- | --- | --- | --- |
 * | `again` | 归零 | 1 | `max(1.3, ease - 0.2)` |
 * | `hard` | +1 | `reps===0 ? 1 : max(prev+1, round(prev*1.2))` | `max(1.3, ease - 0.15)` |
 * | `good` | +1 | `reps===0 ? 1 : reps===1 ? 6 : max(prev+1, round(prev*ease))` | 不变 |
 * | `easy` | +1 | `max(base+1, round(base*1.3))`，`base` 取 `good` 的间隔 | `ease + 0.15` |
 * 间隔上限 `MAX_INTERVAL_DAYS`（365 天）。
 *
 * `initCard` 不生成 id：契约签名没有 id 注入位，`id` 固定为 `null`，由调用方补齐
 * （`reviewCard` 用展开保留调用方写入的 id）。
 *
 * @module domain/srs
 */

const SRS_DAY_MS = 86400000;
const SRS_GRADES = ['again', 'hard', 'good', 'easy'];
const SRS_EASE_DEFAULT = 2.5;
const SRS_EASE_MIN = 1.3;
const SRS_EASE_STEP_AGAIN = 0.2;
const SRS_EASE_STEP_HARD = 0.15;
const SRS_EASE_STEP_EASY = 0.15;
const SRS_HARD_FACTOR = 1.2;
const SRS_EASY_BONUS = 1.3;
const SRS_MAX_INTERVAL_DAYS = 365;

/**
 * 抛出字段级错误。
 * @param {string} name 函数名
 * @param {string} message 错误说明
 * @returns {void}
 */
function srsFail(name, message) {
  throw new Error(`[learning-desk] ${name}：${message}`);
}

/**
 * 校验非空字符串字段。
 * @param {string} name 函数名
 * @param {string} field 字段路径
 * @param {*} value 原值
 * @param {boolean} required 是否必填
 * @returns {string} 字符串值
 */
function srsString(name, field, value, required) {
  if (value === undefined || value === null) {
    if (required) {
      srsFail(name, `${field} 必填`);
    }
    return '';
  }
  if (typeof value !== 'string') {
    srsFail(name, `${field} 必须是字符串，收到 ${JSON.stringify(value)}`);
  }
  if (required && value.length === 0) {
    srsFail(name, `${field} 必填（非空字符串）`);
  }
  return value;
}

/**
 * 校验有限数字字段。
 * @param {string} name 函数名
 * @param {string} field 字段路径
 * @param {*} value 原值
 * @param {number} fallback 缺省值
 * @param {number} min 下限
 * @returns {number} 数字值
 */
function srsNumber(name, field, value, fallback, min) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    srsFail(name, `${field} 必须是有限数字，收到 ${JSON.stringify(value)}`);
  }
  if (value < min) {
    srsFail(name, `${field} 不能小于 ${min}，收到 ${value}`);
  }
  return value;
}

/**
 * 把难度因子夹到下限。
 * @param {number} ease 计算后的难度因子
 * @returns {number} 夹取后的难度因子
 */
function srsClampEase(ease) {
  return Math.max(SRS_EASE_MIN, Math.round(ease * 1000) / 1000);
}

/**
 * 间隔天数夹取到 `[1, MAX_INTERVAL_DAYS]`。
 * @param {number} days 计算出的间隔
 * @returns {number} 合法间隔
 */
function srsClampInterval(days) {
  return Math.min(SRS_MAX_INTERVAL_DAYS, Math.max(1, Math.round(days)));
}

/**
 * 初始化一张新卡：`due` 立即到期，`ease` 取默认值。
 * @param {string} front 正面
 * @param {string} back 背面
 * @param {string} deckId 所属分组 id
 * @param {number} nowMs 当前时刻（epoch 毫秒）
 * @returns {{id: null, deckId: string, front: string, back: string, ease: number, intervalDays: number, due: number, lapses: number, reps: number}} Card
 */
export function initCard(front, back, deckId, nowMs) {
  const name = 'initCard';
  return {
    id: null,
    deckId: srsString(name, 'deckId', deckId, true),
    front: srsString(name, 'front', front, false),
    back: srsString(name, 'back', back, false),
    ease: SRS_EASE_DEFAULT,
    intervalDays: 0,
    due: srsNumber(name, 'nowMs', nowMs, 0, 0),
    lapses: 0,
    reps: 0,
  };
}

/**
 * 按评分推进一张卡，返回新对象（不改写入参）。
 * @param {object} card 复习前卡片
 * @param {'again'|'hard'|'good'|'easy'} grade 评分
 * @param {number} nowMs 当前时刻（epoch 毫秒）
 * @returns {object} 复习后卡片，除状态外保留入参全部字段（含调用方写入的 id）
 */
export function reviewCard(card, grade, nowMs) {
  const name = 'reviewCard';
  if (card === null || typeof card !== 'object' || Array.isArray(card)) {
    srsFail(name, 'card 必须是对象');
  }
  if (!SRS_GRADES.includes(grade)) {
    srsFail(name, `grade 必须是 ${SRS_GRADES.join(' | ')} 之一，收到 ${JSON.stringify(grade)}`);
  }
  const now = srsNumber(name, 'nowMs', nowMs, 0, 0);
  const prevEase = srsNumber(name, 'card.ease', card.ease, SRS_EASE_DEFAULT, 0);
  const prevInterval = srsNumber(name, 'card.intervalDays', card.intervalDays, 0, 0);
  const prevReps = srsNumber(name, 'card.reps', card.reps, 0, 0);
  const prevLapses = srsNumber(name, 'card.lapses', card.lapses, 0, 0);

  let ease = prevEase;
  let intervalDays;
  let reps;
  let lapses = prevLapses;

  if (grade === 'again') {
    ease = srsClampEase(prevEase - SRS_EASE_STEP_AGAIN);
    intervalDays = 1;
    reps = 0;
    lapses = prevLapses + 1;
  } else if (grade === 'hard') {
    ease = srsClampEase(prevEase - SRS_EASE_STEP_HARD);
    intervalDays = prevReps === 0 ? 1 : srsClampInterval(Math.max(prevInterval + 1, prevInterval * SRS_HARD_FACTOR));
    reps = prevReps + 1;
  } else if (grade === 'good') {
    if (prevReps === 0) {
      intervalDays = 1;
    } else if (prevReps === 1) {
      intervalDays = 6;
    } else {
      intervalDays = srsClampInterval(Math.max(prevInterval + 1, prevInterval * prevEase));
    }
    reps = prevReps + 1;
  } else {
    const base = prevReps === 0 ? 1 : prevReps === 1 ? 6 : Math.max(prevInterval + 1, prevInterval * prevEase);
    ease = srsClampEase(prevEase + SRS_EASE_STEP_EASY);
    intervalDays = srsClampInterval(Math.max(base + 1, base * SRS_EASY_BONUS));
    reps = prevReps + 1;
  }

  return {
    ...card,
    ease,
    intervalDays,
    due: now + intervalDays * SRS_DAY_MS,
    lapses,
    reps,
  };
}

/**
 * 取已到期的卡片，按到期时刻升序（同一时刻按 card.id 稳定排序）。
 * @param {object[]} cards 全部卡片
 * @param {number} nowMs 当前时刻（epoch 毫秒）
 * @returns {object[]} 到期卡片（原对象引用）
 */
export function dueCards(cards, nowMs) {
  const name = 'dueCards';
  if (!Array.isArray(cards)) {
    srsFail(name, 'cards 必须是数组');
  }
  const now = srsNumber(name, 'nowMs', nowMs, 0, 0);
  return cards
    .map((card, index) => ({ card, index }))
    .filter((entry) => {
      const due = entry.card === null || typeof entry.card !== 'object' ? undefined : entry.card.due;
      if (typeof due !== 'number' || !Number.isFinite(due)) {
        srsFail(name, `cards[${entry.index}].due 必须是 epoch 毫秒数字`);
      }
      return due <= now;
    })
    .sort((a, b) => a.card.due - b.card.due || a.index - b.index)
    .map((entry) => entry.card);
}
