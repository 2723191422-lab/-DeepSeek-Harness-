/**
 * Zod record schemas of the Learning Desk storage domain: the single authority
 * for every stored field's type, and the schema `open` validates each durable
 * record against (`DomainTableSpec.valueSchema`,
 * `packages/storage/storage-domain/src/spec.ts:29`).
 *
 * Field types follow `../domain/models.js`, which produces every record this
 * domain stores: `tests/storage-contract.test.js` rejects a schema that drifts
 * from a creator. The timestamp and identifier conventions are frozen:
 *
 * - timestamps (`focusRecords.start`, `notes.createdAt` / `updatedAt`,
 *   `cards.due`) are epoch milliseconds as numbers;
 * - date-only fields are `YYYY-MM-DD` strings;
 * - times of day are `HH:mm` strings;
 * - `tasks.priority` is the string enum `low | medium | high`.
 *
 * Unknown fields are stripped rather than rejected, matching the creators,
 * which ignore fields they do not declare.
 *
 * @module storage/schema
 */

import { z } from 'zod'

/** Date-only calendar day, `YYYY-MM-DD`. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Time of day, 24-hour `HH:mm`. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Identifier: the non-empty string the creators require of `id`. */
const idSchema = z.string().min(1)

/** Optional foreign key: a non-empty id or `null`, never an empty string. */
const idOrNullSchema = idSchema.nullable()

/** `YYYY-MM-DD` calendar day. */
const dateSchema = z.string().regex(DATE_RE)

/** `HH:mm` time of day. */
const timeSchema = z.string().regex(TIME_RE)

/**
 * Finite number. `z.number()` already rejects `NaN` and `±Infinity`, which is
 * the `Number.isFinite` check every creator applies.
 */
const numberSchema = z.number()

/** Non-negative duration or count, in minutes / milliseconds / days. */
const nonNegativeSchema = numberSchema.min(0)

/** Deduplicated string list; every element is a non-empty string. */
const stringListSchema = z.array(z.string().min(1))

/**
 * Week-range rule of a timetable entry (`createCourse`).
 * @type {z.ZodType}
 */
export const weeksSchema = z.object({
  from: numberSchema.int().min(1),
  to: numberSchema.int().min(1),
  parity: z.enum(['all', 'odd', 'even']),
}).refine(weeks => weeks.to >= weeks.from, {
  message: 'weeks.to must not be smaller than weeks.from',
})

/**
 * One subtask of a task (`createTask`).
 * @type {z.ZodType}
 */
export const subtaskSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  done: z.boolean(),
})

/** Timetable entry (`createCourse`). @type {z.ZodType} */
export const courseSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  teacher: z.string(),
  location: z.string(),
  weekday: numberSchema.int().min(1).max(7),
  start: timeSchema,
  end: timeSchema,
  weeks: weeksSchema,
  color: z.string(),
  note: z.string(),
})

/** Task (`createTask`). @type {z.ZodType} */
export const taskSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  courseId: idOrNullSchema,
  date: dateSchema.nullable(),
  estimateMin: nonNegativeSchema,
  spentMin: nonNegativeSchema,
  status: z.enum(['todo', 'doing', 'done']),
  priority: z.enum(['low', 'medium', 'high']),
  tags: stringListSchema,
  subtasks: z.array(subtaskSchema),
  order: numberSchema,
})

/** Absolute-minute fields shared by every day-plan block. */
const blockTiming = {
  start: timeSchema,
  end: timeSchema,
  startMin: numberSchema,
  endMin: numberSchema,
  minutes: nonNegativeSchema,
  moved: z.boolean(),
}

/** Timetable block of a composed day plan (`composeDayPlan`). */
const courseBlockSchema = z.object({
  id: idSchema,
  kind: z.literal('course'),
  refId: z.string(),
  title: z.string(),
  ...blockTiming,
  location: z.string(),
  color: z.string(),
})

/**
 * Scheduled-task block of a composed day plan (`composeDayPlan`).
 *
 * `courseId` and `estimateMin` are optional because the composer only attaches
 * them to a block it places itself: a task block produced by a `move` override
 * (`schedule.js` step 2) carries the timings alone.
 */
const taskBlockSchema = z.object({
  id: idSchema,
  kind: z.literal('task'),
  refId: z.string(),
  title: z.string(),
  ...blockTiming,
  courseId: z.string().nullable().optional(),
  estimateMin: nonNegativeSchema.optional(),
})

/** User-added block of a composed day plan (`composeDayPlan`). */
const customBlockSchema = z.object({
  id: idSchema,
  kind: z.literal('custom'),
  refId: z.string(),
  title: z.string(),
  ...blockTiming,
})

/** One block of a composed day plan. @type {z.ZodType} */
export const dayBlockSchema = z.discriminatedUnion('kind', [
  courseBlockSchema,
  taskBlockSchema,
  customBlockSchema,
])

/** User override that deletes a composed block. */
const removeOverrideSchema = z.object({
  id: idSchema,
  type: z.literal('remove'),
  refId: idSchema,
})

/** User override that moves a composed block. */
const moveOverrideSchema = z.object({
  id: idSchema,
  type: z.literal('move'),
  refId: idSchema,
  start: timeSchema,
  end: timeSchema,
})

/** User override that adds a block. */
const addOverrideSchema = z.object({
  id: idSchema,
  type: z.literal('add'),
  title: z.string().min(1),
  start: timeSchema,
  end: timeSchema,
})

/** One user override of a composed day plan. @type {z.ZodType} */
export const dayOverrideSchema = z.discriminatedUnion('type', [
  removeOverrideSchema,
  moveOverrideSchema,
  addOverrideSchema,
])

/** Composed day plan plus its user overrides (`composeDayPlan`). @type {z.ZodType} */
export const dayPlanSchema = z.object({
  date: dateSchema,
  blocks: z.array(dayBlockSchema),
  overrides: z.array(dayOverrideSchema),
})

/** Focus session (`createFocusRecord`). @type {z.ZodType} */
export const focusRecordSchema = z.object({
  id: idSchema,
  taskId: idOrNullSchema,
  courseId: idOrNullSchema,
  start: nonNegativeSchema,
  durationMin: nonNegativeSchema,
  mode: z.enum(['pomodoro', 'countup', 'break']),
  completed: z.boolean(),
})

/** Note (`createNote`). @type {z.ZodType} */
export const noteSchema = z.object({
  id: idSchema,
  title: z.string(),
  markdown: z.string(),
  tags: stringListSchema,
  linkTaskIds: stringListSchema,
  linkCourseIds: stringListSchema,
  createdAt: nonNegativeSchema,
  updatedAt: nonNegativeSchema,
})

/**
 * Spaced-repetition card (`initCard` / `reviewCard`). `id` is the table key and
 * is assigned by the caller: `initCard` returns `null` there and the stored
 * record carries the id.
 * @type {z.ZodType}
 */
export const cardSchema = z.object({
  id: idSchema,
  deckId: idSchema,
  front: z.string(),
  back: z.string(),
  ease: nonNegativeSchema,
  intervalDays: nonNegativeSchema,
  due: nonNegativeSchema,
  lapses: nonNegativeSchema,
  reps: nonNegativeSchema,
})

/** Card deck (`createDeck`). @type {z.ZodType} */
export const deckSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  courseId: idOrNullSchema,
  description: z.string(),
})

/** Saved learning resource (`createResource`). @type {z.ZodType} */
export const resourceSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  url: z.string(),
  kind: z.enum(['link', 'book', 'course', 'video']),
  tags: stringListSchema,
  status: z.enum(['unread', 'reading', 'done']),
  progress: numberSchema.min(0).max(1),
  note: z.string(),
})

/**
 * Settings, the domain's global singleton (`createSettings`). The schema is
 * also the global slot's schema, so it must reject `null`: the medium uses
 * `null` as its "never written" sentinel.
 * @type {z.ZodType}
 */
export const settingsSchema = z.object({
  dailyGoalMin: nonNegativeSchema,
  pomodoroMin: numberSchema.min(1),
  breakMin: nonNegativeSchema,
  reviewLimit: numberSchema.int().min(1),
  termStartDate: dateSchema.nullable(),
  weekStartsOn: numberSchema.int().min(1).max(7),
  theme: z.enum(['system', 'light', 'dark']),
})
