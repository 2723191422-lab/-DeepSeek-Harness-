/**
 * Host half of the Learning Desk bundle (`dsh-learning-desk`).
 *
 * This module imports no Harness package on purpose. The boot version gate
 * compares a package's own `@deepseek-ai/dsh*` peer ranges against the running
 * Harness and skips the whole package on a mismatch
 * (`packages/boot/app-boot/README.md:52`), so a Host half with no Harness
 * import cannot be skipped for that reason. `zod` is the single npm dependency
 * and is not a Harness package.
 *
 * The record schemas in `./src/storage/schema.js` are the authority on every
 * stored field's type; `TABLES` binds each table name to its schema. The authenticated API and tools share these tables.
 * `tests/storage-contract.test.js` fails when a schema drifts from a creator in
 * `./src/domain/models.js`.
 *
 * @module index
 */

import { openDesk, publicFailure } from './src/host/service.js'
import { deskTools } from './src/host/tools.js'

import { TABLES, UNIT_NAME_RE, defineDomain, domainTable, learningDeskDomain } from './src/storage/domain.js'

export { TABLES, UNIT_NAME_RE, defineDomain, domainTable, learningDeskDomain }

/**
 * Required Host services: durable storage, the authenticated Fetch registry,
 * and the model tool registry.
 *
 * @type {readonly string[]}
 */
export const inject = ['storageDomain', 'connection', 'tools']

/**
 * Validate one record against its declared table, using the table's own zod
 * schema. The returned error list is a flat diagnostic for tools and logs;
 * callers that need the structured issues read `TABLES[tableName].valueSchema`
 * directly.
 *
 * @param {string} tableName - declared table name, e.g. `cards`.
 * @param {unknown} record - the candidate record.
 * @returns {{ ok: boolean, errors: string[] }} the verdict and every issue found.
 */
export function validateRecord(tableName, record) {
  const spec = TABLES[tableName]
  if (spec === undefined) return { ok: false, errors: [`unknown table: ${String(tableName)}`] }
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, errors: ['record must be an object'] }
  }
  const parsed = spec.valueSchema.safeParse(record)
  if (parsed.success) return { ok: true, errors: [] }
  return {
    ok: false,
    errors: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
  }
}

/** Open the data owner and register authenticated API and model tools.
 * @param {object} ctx - Host Cordis context with injected services.
 * @returns {Promise<void>} Resolves after effect-owned activation.
 */
export function apply(ctx) {
  return ctx.effect(async () => {
    const desk = await openDesk(ctx)
    try {
      ctx.effect(() => ctx.connection.fetch.register({
        path: '/api/learning-desk', methods: ['GET', 'POST'], requestBody: 'buffered',
        fetch: async request => {
          try {
            const value = request.method === 'GET' ? await desk.read() : await desk.command(await request.json())
            return Response.json({ ok: true, value }, { headers: { 'cache-control': 'no-store' } })
          } catch (error) { return Response.json(publicFailure(error), { status: 400 }) }
        },
      }), 'learning-desk: API')
      for (const definition of deskTools(desk)) ctx.effect(() => ctx.tools.register(definition), `learning-desk: ${definition.name}`)
    } catch (error) { await desk.close(); throw error }
    return () => desk.close()
  }, 'learning-desk: storage domain').then(() => {})
}
