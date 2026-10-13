/**
 * Declaration of the Learning Desk storage domain: the local vocabulary the
 * Harness `storageDomain` service opens, plus the eight tables of
 * `docs/02-dsh-plugin-spec.md` §3 and the settings global.
 *
 * `defineDomain` / `domainTable` are re-implemented here on purpose. Importing
 * `@deepseek-ai/dsh-storage-domain` would add a `@deepseek-ai/dsh-*`
 * peer range, and the boot version gate skips a whole bundle whose range misses
 * the running Harness (`packages/boot/app-boot/README.md:52`), which costs more
 * than the ten lines this file duplicates. The load-time checks of
 * `packages/storage/storage-domain/src/spec.ts:107-135` are kept: the same
 * misconfiguration fails loud at module load here instead of at `open`.
 *
 * Table names are part of the durable medium (each is a file-name / SQL
 * identifier segment), so they match `UNIT_NAME_RE` and use underscores:
 * `day_plans`, `focus_records`.
 *
 * @module storage/domain
 */

import { createSettings } from '../domain/models.js'
import {
  cardSchema,
  courseSchema,
  dayPlanSchema,
  deckSchema,
  focusRecordSchema,
  noteSchema,
  resourceSchema,
  settingsSchema,
  taskSchema,
} from './schema.js'

/** Allowed format for a domain and a table name (`storage/src/backend.ts:10`). */
export const UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/

/**
 * Declare one table around its record schema.
 *
 * @param {import('zod').ZodType} schema - schema validating every stored record of this table.
 * @returns {Readonly<{valueSchema: import('zod').ZodType}>} the table declaration.
 */
export function domainTable(schema) {
  return Object.freeze({ valueSchema: schema })
}

/**
 * Validate a domain declaration at load time and return it unchanged. The
 * checks mirror the Harness helper: identity, version, compatibility entries,
 * layout, invalid-record policy, table names, and a global schema that must not
 * accept `null` (the medium's "never written" sentinel).
 *
 * @param {object} spec - the domain declaration.
 * @returns {object} the same declaration.
 */
export function defineDomain(spec) {
  if (!UNIT_NAME_RE.test(spec.name)) {
    throw new Error(`domain name '${spec.name}' must match ${UNIT_NAME_RE}`)
  }
  if (!Number.isInteger(spec.version) || spec.version < 0) {
    throw new Error(`domain '${spec.name}' version must be a non-negative integer, got ${spec.version}`)
  }
  for (const compat of spec.compatibleVersions ?? []) {
    if (!Number.isInteger(compat) || compat < 0 || compat >= spec.version) {
      throw new Error(
        `domain '${spec.name}' compatibleVersions entries must be non-negative integers below version ${spec.version}, got ${compat}`,
      )
    }
  }
  if (spec.layout !== undefined && spec.layout !== 'single' && spec.layout !== 'per-record') {
    throw new Error(`domain '${spec.name}' layout must be 'single' or 'per-record', got ${spec.layout}`)
  }
  if (spec.invalidRecords !== undefined && spec.invalidRecords !== 'backup-and-skip') {
    throw new Error(`domain '${spec.name}' invalidRecords must be 'backup-and-skip' when present, got ${spec.invalidRecords}`)
  }
  for (const table of Object.keys(spec.tables)) {
    if (!UNIT_NAME_RE.test(table)) {
      throw new Error(`domain '${spec.name}' table name '${table}' must match ${UNIT_NAME_RE}`)
    }
  }
  if (spec.global !== undefined && spec.global.schema.safeParse(null).success) {
    throw new Error(
      `domain '${spec.name}' global schema must not accept null: `
      + 'null is the medium\'s "never written" sentinel, so a stored null could not round-trip',
    )
  }
  return spec
}

/**
 * One table declaration per stored entity, keyed by the durable table name.
 * The schemas in `./schema.js` are the authority; this map only binds them.
 *
 * @type {Readonly<Record<string, {valueSchema: import('zod').ZodType}>>}
 */
export const TABLES = Object.freeze({
  courses: domainTable(courseSchema),
  tasks: domainTable(taskSchema),
  day_plans: domainTable(dayPlanSchema),
  focus_records: domainTable(focusRecordSchema),
  notes: domainTable(noteSchema),
  cards: domainTable(cardSchema),
  decks: domainTable(deckSchema),
  resources: domainTable(resourceSchema),
})

/**
 * The Learning Desk domain this bundle opens. Version 1 is the first stored
 * format; there is no earlier on-disk shape to migrate.
 *
 * @type {Readonly<object>}
 */
export const learningDeskDomain = Object.freeze(defineDomain({
  name: 'learning_desk',
  version: 1,
  tables: TABLES,
  global: Object.freeze({
    schema: settingsSchema,
    // Served until the first write; frozen so a reader cannot corrupt the default.
    initial: Object.freeze(createSettings()),
  }),
}))
