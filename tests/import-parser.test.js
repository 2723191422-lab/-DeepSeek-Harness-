import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleText } from '../src/domain/import-parser.js';
import { coursesOn } from '../src/domain/term-weeks.js';

const TERM = '2026-03-02';

test('解析标准行：星期 + 时间 + 课程名 + 地点 + 周次', () => {
  const { courses, errors } = parseScheduleText('周一 08:00-09:40 高等数学 教三-201 1-16周');
  assert.deepEqual(errors, []);
  assert.equal(courses.length, 1);
  assert.deepEqual(courses[0], {
    id: 'imp-1',
    name: '高等数学',
    teacher: '',
    location: '教三-201',
    weekday: 1,
    start: '08:00',
    end: '09:40',
    weeks: { from: 1, to: 16, parity: 'all' },
    color: '',
    note: '',
  });
});

test('周次段缺省视为 1-16/all，地点可缺省', () => {
  const { courses, errors } = parseScheduleText('周二 14:00-15:40 大学物理');
  assert.deepEqual(errors, []);
  assert.equal(courses[0].location, '');
  assert.equal(courses[0].weekday, 2);
  assert.deepEqual(courses[0].weeks, { from: 1, to: 16, parity: 'all' });
  assert.equal(courses[0].id, 'imp-1');
});

test('周次写法变体', () => {
  const cases = [
    ['1-16周(单)', { from: 1, to: 16, parity: 'odd' }],
    ['1-16周（双）', { from: 1, to: 16, parity: 'even' }],
    ['3-8周单', { from: 3, to: 8, parity: 'odd' }],
    ['单周', { from: 1, to: 16, parity: 'odd' }],
    ['双周', { from: 1, to: 16, parity: 'even' }],
    ['第5周', { from: 5, to: 5, parity: 'all' }],
    ['7周', { from: 7, to: 7, parity: 'all' }],
    ['1-16', { from: 1, to: 16, parity: 'all' }],
  ];
  for (const [token, weeks] of cases) {
    const { courses, errors } = parseScheduleText(`周一 08:00-09:40 高数 ${token}`);
    assert.deepEqual(errors, [], token);
    assert.deepEqual(courses[0].weeks, weeks, token);
  }
});

test('乱序输入：星期与时间可出现在任意位置', () => {
  const { courses, errors } = parseScheduleText('高等数学 1-16周 教三-201 周一 08:00-09:40');
  assert.deepEqual(errors, []);
  assert.equal(courses[0].name, '高等数学');
  assert.equal(courses[0].location, '教三-201');
  assert.equal(courses[0].weekday, 1);
  assert.equal(courses[0].start, '08:00');
});

test('容错：星期与时间粘连、全角冒号、单位数小时、跨天时间', () => {
  const glued = parseScheduleText('周一08:00-09:40 高数');
  assert.deepEqual(glued.errors, []);
  assert.equal(glued.courses[0].name, '高数');

  const fullWidth = parseScheduleText('星期一 08：00-09：40 高数');
  assert.deepEqual(fullWidth.errors, []);
  assert.equal(fullWidth.courses[0].start, '08:00');
  assert.equal(fullWidth.courses[0].end, '09:40');

  const padded = parseScheduleText('周日 8:00-9:40 高数');
  assert.deepEqual(padded.errors, []);
  assert.equal(padded.courses[0].start, '08:00');
  assert.equal(padded.courses[0].weekday, 7);

  const overnight = parseScheduleText('周日 23:00-00:30 夜读');
  assert.deepEqual(overnight.errors, []);
  assert.equal(overnight.courses[0].start, '23:00');
  assert.equal(overnight.courses[0].end, '00:30');
});

test('畸形输入全部进 errors 而不是抛错', () => {
  const { courses, errors } = parseScheduleText(
    ['周一 高等数学', '08:00-09:40 高等数学', '周一 08:00-09:40', '??? ??? ???', '周一 25:00-26:00 高数', '周一 08:60-09:40 高数'].join(
      '\n',
    ),
  );
  assert.deepEqual(courses, []);
  assert.deepEqual(
    errors.map((item) => [item.line, item.reason]),
    [
      [1, '缺少时间（需要 HH:MM-HH:MM）'],
      [2, '缺少星期（如 周一）'],
      [3, '缺少课程名'],
      [4, '缺少时间（需要 HH:MM-HH:MM）'],
      [5, '时间不合法：25:00-26:00'],
      [6, '时间不合法：08:60-09:40'],
    ],
  );
  assert.equal(errors[0].raw, '周一 高等数学');
  assert.deepEqual(Object.keys(errors[0]).sort(), ['line', 'raw', 'reason']);
});

test('空行静默跳过，CRLF 与空行不产生错误', () => {
  const { courses, errors } = parseScheduleText('\n\r\n周一 08:00-09:40 高数\r\n   \n周二 10:00-11:40 英语\n\n');
  assert.deepEqual(errors, []);
  assert.deepEqual(
    courses.map((course) => [course.id, course.name]),
    [
      ['imp-3', '高数'],
      ['imp-5', '英语'],
    ],
  );
});

test('超长行进 errors 且不抛错', () => {
  const long = `周一 08:00-09:40 ${'x'.repeat(5000)}`;
  const { courses, errors } = parseScheduleText(long);
  assert.deepEqual(courses, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0].reason, /^行过长（\d+ 字符，上限 4096）$/);
  assert.equal(errors[0].reason, `行过长（${long.length} 字符，上限 4096）`);
});

test('解析结果可直接用于周次命中判定', () => {
  const { courses } = parseScheduleText('周一 08:00-09:40 高数 1-16周(单)');
  assert.equal(coursesOn(TERM, courses, TERM).length, 1);
  assert.equal(coursesOn('2026-03-09', courses, TERM).length, 0);
  assert.equal(coursesOn('2026-03-16', courses, TERM).length, 1);
});

test('任意垃圾输入都不抛异常', () => {
  const inputs = [
    null,
    undefined,
    42,
    {},
    [],
    '\u0000\u0001',
    '😀😀😀',
    '周一 08:00-09:40 ' + '超长课程名'.repeat(100),
    '周八 08:00-09:40 高数',
    '周一 08:00 高数',
  ];
  for (const input of inputs) {
    let result;
    assert.doesNotThrow(() => {
      result = parseScheduleText(input);
    });
    assert.ok(Array.isArray(result.courses), String(input));
    assert.ok(Array.isArray(result.errors), String(input));
    for (const item of result.errors) {
      assert.deepEqual(Object.keys(item).sort(), ['line', 'raw', 'reason']);
      assert.equal(typeof item.reason, 'string');
    }
  }
  assert.deepEqual(parseScheduleText(null).errors, [{ line: 0, raw: 'null', reason: '输入必须是字符串' }]);
  assert.deepEqual(parseScheduleText(42).errors, [{ line: 0, raw: '42', reason: '输入必须是字符串' }]);
});
