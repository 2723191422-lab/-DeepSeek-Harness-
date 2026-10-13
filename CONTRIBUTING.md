# Contributing

The plugin uses plain ESM and only `zod` at runtime. Browser React comes from the host module loader. The committed browser file is generated; installing from GitHub requires no build step.

## Verify a change

```sh
npm ci --no-audit --no-fund
npm run build
npm run check
npm test
git diff --exit-code client.js
git diff --check
```

The final client diff check applies after committing an intentional regeneration. CI repeats it from a clean checkout. Run focused suites while editing, then the full plugin suite before release. Use `git archive HEAD` in an empty temporary directory for acceptance; do not copy `node_modules`.

## Source rules

- Keep `src/domain/**` unchanged unless a separately justified algorithm change updates its tests. Keep `src/storage/**` schemas aligned with creators; never weaken the drift guard.
- Edit browser sources in `src/ui/**`, then run `npm run build`. Supported ESM syntax and failure modes are documented in [runtime.md](docs/runtime.md).
- Import only React and local modules in UI sources. Never add a Harness dependency or require a Harness client package. `dsh.client.inject` orders activation; it does not permit package imports.
- Use host semantic theme tokens, prefixed CSS selectors, and locale-owned copy. Match every Chinese dictionary key with an English one.
- Hold each registry contribution in an effect. Dispose requests, polling, listeners, tools, routes, and storage handles on unload.
- Validate JSON/config/storage input. Serialize writes; report uncertain outcomes and stop dependent work. Do not log private data in public failures.
- Learning tables belong to the Host. Browser storage is only read to recover older backups; do not create another writer. Use existing tool/session logging rather than new session event types.

## Browser acceptance

Use a separate Web profile with the plugin installed. Check all five sections, course-to-timeline composition, task completion, focus across navigation and refresh, note/card/resource flows, import preview, localized metadata, keyboard dialogs, and wide/narrow containers. Theme and locale checks must use the actual host. Report physical sleep, real-model calls, installation, and browser checks separately from injected-clock and unit tests.

Do not commit personal learning data, credentials, launch tokens, host logs, `node_modules`, or package archives. Crop public screenshots to the plugin surface.
