/**
 * 学期周次解析（规格 §4.1）：把「日期 + 学期起始日」映射到 1-based 周次，
 * 并判定课表条目是否命中某一天。
 *
 * 周界以 `termStartDate` 为锚点：`weekIndex(date) = floor((date - termStart) / 7) + 1`，
 * 因此学期起始日本身是第 1 周。起始日之前的日期得到 ≤ 0 的周次（不命中任何条目）。
 *
 * 实现不使用 `Date` 对象与本地时区：日期先转成「epoch 日序」（1970-01-01 为 0），
 * 再做整数运算，结果与运行机器的时区无关。
 *
 * @module domain/term-weeks
 */

const TW_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TW_PARITIES = ['all', 'odd', 'even'];

/**
 * 抛出字段级错误。
 * @param {string} name 函数名
 * @param {string} message 错误说明
 * @returns {void}
 */
function twFail(name, message) {
  throw new Error(`[learning-desk] ${name}：${message}`);
}

/**
 * 校验并拆出年月日。
 * @param {string} name 调用方函数名
 * @param {string} value 日期字符串
 * @returns {{year: number, month: number, day: number}} 年月日
 */
function twParts(name, value) {
  if (typeof value !== 'string') {
    twFail(name, `日期必须是 'YYYY-MM-DD' 字符串，收到 ${JSON.stringify(value)}`);
  }
  const match = TW_DATE_RE.exec(value);
  if (!match) {
    twFail(name, `日期必须是 'YYYY-MM-DD' 字符串，收到 ${JSON.stringify(value)}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > twDaysInMonth(year, month)) {
    twFail(name, `日期不存在：${value}`);
  }
  return { year, month, day };
}

/**
 * 该年该月的天数。
 * @param {number} year 年
 * @param {number} month 月（1-12）
 * @returns {number} 天数
 */
function twDaysInMonth(year, month) {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/**
 * 公历日期 → epoch 日序（Howard Hinnant 的 days_from_civil）。
 * @param {number} year 年
 * @param {number} month 月
 * @param {number} day 日
 * @returns {number} 自 1970-01-01 起的天数
 */
function twDaysFromCivil(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * epoch 日序 → ISO 星期（1=周一 … 7=周日）。
 * @param {number} dayNumber epoch 日序
 * @returns {number} ISO 星期
 */
function twIsoWeekday(dayNumber) {
  const sundayBased = ((dayNumber + 4) % 7 + 7) % 7;
  return sundayBased === 0 ? 7 : sundayBased;
}

/**
 * 归一化课表条目的周次规则；缺失字段按 `{from:1,to:16,parity:'all'}` 补齐。
 * @param {object} course 课表条目
 * @returns {{from: number, to: number, parity: string}} 周次规则
 */
function twWeeks(course) {
  const weeks = course.weeks;
  if (weeks === undefined || weeks === null) {
    return { from: 1, to: 16, parity: 'all' };
  }
  if (typeof weeks !== 'object' || Array.isArray(weeks)) {
    twFail('courseOccursOn', 'course.weeks 必须是对象 { from, to, parity }');
  }
  const from = weeks.from === undefined || weeks.from === null ? 1 : weeks.from;
  const to = weeks.to === undefined || weeks.to === null ? 16 : weeks.to;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    twFail('courseOccursOn', `course.weeks 非法：from=${from}, to=${to}`);
  }
  const parity = weeks.parity === undefined || weeks.parity === null ? 'all' : weeks.parity;
  if (!TW_PARITIES.includes(parity)) {
    twFail('courseOccursOn', `course.weeks.parity 必须是 ${TW_PARITIES.join(' | ')} 之一，收到 ${JSON.stringify(parity)}`);
  }
  return { from, to, parity };
}

/**
 * 学期周次：学期起始日所在周为第 1 周。
 * @param {string} dateStr 目标日期 `YYYY-MM-DD`
 * @param {string} termStartDateStr 学期起始日 `YYYY-MM-DD`
 * @returns {number} 1-based 周次；起始日之前返回 ≤ 0
 */
export function weekIndex(dateStr, termStartDateStr) {
  const target = twParts('weekIndex', dateStr);
  const start = twParts('weekIndex', termStartDateStr);
  const diff = twDaysFromCivil(target.year, target.month, target.day)
    - twDaysFromCivil(start.year, start.month, start.day);
  return Math.floor(diff / 7) + 1;
}

/**
 * 判定课表条目是否命中某一天：星期相同、周次落在 `weeks.from..to` 内且单双周匹配。
 * @param {object} course 课表条目，至少含 `weekday` 与可选的 `weeks`
 * @param {string} dateStr 目标日期 `YYYY-MM-DD`
 * @param {string} termStartDateStr 学期起始日 `YYYY-MM-DD`
 * @returns {boolean} 命中为 true
 */
export function courseOccursOn(course, dateStr, termStartDateStr) {
  if (course === null || typeof course !== 'object' || Array.isArray(course)) {
    twFail('courseOccursOn', 'course 必须是对象');
  }
  const weekday = course.weekday;
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    twFail('courseOccursOn', `course.weekday 必须是 1..7 的整数，收到 ${JSON.stringify(weekday)}`);
  }
  const { from, to, parity } = twWeeks(course);
  const parts = twParts('courseOccursOn', dateStr);
  const dayNumber = twDaysFromCivil(parts.year, parts.month, parts.day);
  if (twIsoWeekday(dayNumber) !== weekday) {
    return false;
  }
  const index = weekIndex(dateStr, termStartDateStr);
  if (index < from || index > to) {
    return false;
  }
  if (parity === 'odd') {
    return index % 2 === 1;
  }
  if (parity === 'even') {
    return index % 2 === 0;
  }
  return true;
}

/**
 * 取某一天命中的全部课表条目，保持入参顺序。
 * @param {string} dateStr 目标日期 `YYYY-MM-DD`
 * @param {object[]} courses 全部课表条目
 * @param {string} termStartDateStr 学期起始日 `YYYY-MM-DD`
 * @returns {object[]} 命中的条目（原对象引用）
 */
export function coursesOn(dateStr, courses, termStartDateStr) {
  if (!Array.isArray(courses)) {
    twFail('coursesOn', 'courses 必须是数组');
  }
  return courses.filter((course) => courseOccursOn(course, dateStr, termStartDateStr));
}
