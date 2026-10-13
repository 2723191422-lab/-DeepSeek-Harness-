/**
 * 课表文本导入：把教务系统复制粘贴的文本解析成结构化课表条目。
 *
 * 目标格式（容错）：`周一 08:00-09:40 高等数学 教三-201 1-16周`
 * - 星期段与时间段可以出现在任意位置（乱序也认），缺失星期或时间则记 `errors`；
 * - 周次段可缺省（视为 `1-16/all`），支持 `1-16周`、`1-16周(单)`、`1-16周（双）`、
 *   `1-16周单`、`单周`、`双周`、`第5周`；行尾可省略「周」字（`1-16`）；
 * - 时间之后的第一个剩余词作为课程名，其余词拼成地点（课程名含空格时无法反解）。
 *
 * **本模块绝不抛异常**：任何无法解析的行都进 `errors`，元素为 `{ line, raw, reason }`
 * （`line` 为 1-based 行号，`raw` 为原始行文本）。空行静默跳过。
 *
 * @module domain/import-parser
 */

import { createCourse } from './models.js';

const IMP_MAX_LINE_LENGTH = 4096;
const IMP_TIME_RE = /(\d{1,2})\s*[:：]\s*(\d{2})\s*[-–—~～至到]\s*(\d{1,2})\s*[:：]\s*(\d{2})/;
const IMP_BARE_PARITY_RE = /^[(（]?\s*(单|双)\s*周?\s*[)）]?$/;
const IMP_RANGE_RE = /^(\d{1,2})\s*[-–—~～至到]\s*(\d{1,2})\s*周?\s*(?:[(（]\s*(单|双)\s*周?\s*[)）]|(单|双))?$/;
const IMP_BARE_RANGE_RE = /^(\d{1,2})\s*[-–—~～至到]\s*(\d{1,2})$/;
const IMP_SINGLE_WEEK_RE = /^第?(\d{1,2})\s*周$/;

/** 星期词 → ISO 星期（1=周一 … 7=周日）。 */
const IMP_WEEKDAY_TOKENS = (() => {
  const map = new Map();
  const names = ['一', '二', '三', '四', '五', '六', '日'];
  for (let index = 0; index < names.length; index += 1) {
    const weekday = index + 1;
    const name = names[index];
    for (const prefix of ['周', '星期', '礼拜']) {
      map.set(`${prefix}${name}`, weekday);
      map.set(`${prefix}${weekday}`, weekday);
    }
  }
  map.set('周天', 7);
  map.set('星期天', 7);
  map.set('礼拜天', 7);
  return map;
})();

/**
 * 把两位数字的时分规范成 `HH:mm`。
 * @param {string} hour 小时
 * @param {string} minute 分钟
 * @returns {string|null} `HH:mm`，越界为 null
 */
function impTime(hour, minute) {
  const h = Number(hour);
  const m = Number(minute);
  if (h > 23 || m > 59) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 解析周次词。
 * @param {string} raw 候选词
 * @param {boolean} isLast 是否为行尾词（决定能否省略「周」字）
 * @returns {{from: number, to: number, parity: string}|null} 周次规则
 */
function impWeeks(raw, isLast) {
  const text = raw.trim();
  if (text.length === 0) {
    return null;
  }
  const bare = IMP_BARE_PARITY_RE.exec(text);
  if (bare) {
    return { from: 1, to: 16, parity: bare[1] === '单' ? 'odd' : 'even' };
  }
  const range = IMP_RANGE_RE.exec(text);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    const parityToken = range[3] || range[4];
    if (from >= 1 && to >= from) {
      return { from, to, parity: parityToken === '单' ? 'odd' : parityToken === '双' ? 'even' : 'all' };
    }
    return null;
  }
  if (isLast) {
    const loose = IMP_BARE_RANGE_RE.exec(text);
    if (loose) {
      const from = Number(loose[1]);
      const to = Number(loose[2]);
      if (from >= 1 && to >= from) {
        return { from, to, parity: 'all' };
      }
    }
  }
  const single = IMP_SINGLE_WEEK_RE.exec(text);
  if (single) {
    const week = Number(single[1]);
    if (week >= 1) {
      return { from: week, to: week, parity: 'all' };
    }
  }
  return null;
}

/**
 * 解析单行。
 * @param {string} trimmed 已 trim 的行
 * @param {number} line 1-based 行号（用于生成稳定 id）
 * @returns {{course: object}|{error: string}} 解析结果
 */
function impLine(trimmed, line) {
  const timeMatch = IMP_TIME_RE.exec(trimmed);
  if (!timeMatch) {
    return { error: '缺少时间（需要 HH:MM-HH:MM）' };
  }
  const start = impTime(timeMatch[1], timeMatch[2]);
  const end = impTime(timeMatch[3], timeMatch[4]);
  if (start === null || end === null) {
    return { error: `时间不合法：${timeMatch[0]}` };
  }

  const rest = `${trimmed.slice(0, timeMatch.index)} ${trimmed.slice(timeMatch.index + timeMatch[0].length)}`;
  const tokens = rest.split(/\s+/).filter((token) => token.length > 0);

  let weekday = null;
  const kept = [];
  for (const token of tokens) {
    const found = IMP_WEEKDAY_TOKENS.get(token);
    if (found !== undefined && weekday === null) {
      weekday = found;
    } else {
      kept.push(token);
    }
  }
  if (weekday === null) {
    return { error: '缺少星期（如 周一）' };
  }

  let weeks = { from: 1, to: 16, parity: 'all' };
  for (let index = kept.length - 1; index >= 0; index -= 1) {
    const parsed = impWeeks(kept[index], index === kept.length - 1);
    if (parsed) {
      weeks = parsed;
      kept.splice(index, 1);
      break;
    }
  }
  if (kept.length === 0) {
    return { error: '缺少课程名' };
  }

  return {
    course: createCourse({
      id: `imp-${line}`,
      name: kept[0],
      location: kept.slice(1).join(' '),
      weekday,
      start,
      end,
      weeks,
    }),
  };
}

/**
 * 解析课表文本。
 * @param {string} text 粘贴文本，一行一条
 * @returns {{courses: object[], errors: {line: number, raw: string, reason: string}[]}} 解析结果
 */
export function parseScheduleText(text) {
  const courses = [];
  const errors = [];
  if (typeof text !== 'string') {
    errors.push({ line: 0, raw: String(text), reason: '输入必须是字符串' });
    return { courses, errors };
  }
  const lines = text.split(/\r\n|\r|\n/);
  lines.forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return;
    }
    if (trimmed.length > IMP_MAX_LINE_LENGTH) {
      errors.push({ line, raw, reason: `行过长（${trimmed.length} 字符，上限 ${IMP_MAX_LINE_LENGTH}）` });
      return;
    }
    let parsed;
    try {
      parsed = impLine(trimmed, line);
    } catch (error) {
      errors.push({ line, raw, reason: `解析内部错误：${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    if (parsed.error !== undefined) {
      errors.push({ line, raw, reason: parsed.error });
      return;
    }
    courses.push(parsed.course);
  });
  return { courses, errors };
}
