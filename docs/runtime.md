---
kind: package-reference
description: Learning data ownership, lifecycle, transport and generated browser modules.
---
# Runtime architecture

English | [中文](runtime.zh.md)

## Summary

The browser and Agent tools operate on one Host-owned desk. The browser keeps a disposable cache; the Host validates and serializes writes, and durable domains survive restarts. No new Session event type is introduced.

## Table of Contents

- [Data and transport](#data-and-transport)
- [Lifecycle and recovery](#lifecycle-and-recovery)
- [Client generation](#client-generation)
- [Platform evidence](#platform-evidence)

<a id="data-and-transport"></a>

## Data and transport

`learning_desk` version 1 retains the existing eight tables and settings global without schema changes. `learning_desk_runtime` version 1 holds active timer segments and the current local date's review count. Only the Host writes these domains. JSON backups contain learning tables/settings; importing resets the daily review counter and does not restore an active timer.

The browser uses same-origin GET/POST `/api/learning-desk`, registered in `ctx.connection.fetch`. The host transport owns authentication, request admission and buffering. GET returns `{ok:true,value}` with all desk data and runtime projections; POST accepts validated `put`, `delete`, `settings`, `import`, `review`, or `timer` commands. Failures return `{ok:false,code,message}` without paths or stacks. This is an authenticated Fetch route; no custom RPC namespace is registered.

The four tools register through `ctx.tools.register` and call the same service. Results are canonical `{ok,text}` values with readable JSON and a pure generic presenter. Note-to-card generation first returns the selected note, then accepts 1–100 nonempty question/answer pairs. Model quality and grounding are the caller's responsibility.

Day plans persist explicit overrides only; generated blocks are recomputed from courses and tasks. Statistics use local calendar days, completed non-break focus records, and current task-to-course/tag relationships. Editing a task's tags also changes historical tag distribution. Course ranges in the UI must end later on the same day.

<a id="lifecycle-and-recovery"></a>

## Lifecycle and recovery

One promise queue serializes reads and writes within a plugin instance. Loading failures reject activation. Disposal rejects new work, waits for accepted work, then closes both domains; route/tool effects and browser polling/subscriptions are also disposed. Browser requests are aborted when the plugin unloads.

A write failure can occur after earlier records committed. The service marks the desk uncertain and refuses further dependent operations until restart. Replacement imports validate all tables, duplicate identifiers, settings and card/deck references before deleting records; the backend operations are sequential, not a multi-table transaction. Export before replacement or clearing data.

Timer transitions persist epoch timestamps and accumulated active segments. Countdown elapsed time is capped at the configured duration. Finishing splits active segments at local midnight and writes stable timer/day identifiers, so retrying a completion does not duplicate records. A timer that expires while offline settles on the next Host read. Paused intervals and breaks do not add study minutes.

Older browser JSON under `dsh.learning-desk.v1` is read without overwriting or deleting it. Valid and corrupt backups both expose an export action; users explicitly import a valid backup into the Host. No browser learning writer remains.

<a id="client-generation"></a>

## Client generation

`npm run build` traverses reachable modules from `src/ui/entry.js`, orders them by relative path, and writes a module registry inside the host loader factory. React resolves through `require('react')`; no other bare import is accepted. The committed file contains no timestamp or absolute path.

Supported declarations are named imports with aliases, namespace imports, exported function/const/let/class declarations, and a standalone named export list without aliases. Default or side-effect imports, dynamic imports, default/star/re-export/aliased/async exports, cycles and imports outside the source root fail with a filename and line. This is a restricted source inliner, not a general JavaScript bundler.

<a id="platform-evidence"></a>

## Platform evidence

Evidence refers to the Harness checkout used for integration, version `0.2.1-alpha.2-d743267`; later platform revisions may require revalidation.

| Fact | Owning Harness source |
| --- | --- |
| Shared Fetch requests are authenticated/admitted by the host | `packages/client/connection/src/index.ts:116`, `:142`, `:150` |
| Effect-owned global tool registration | `packages/core/tools/src/index.ts:1064`, `:1069`, `:1091` |
| Owner-scoped sidebar/main slots are used by the built-in plugin manager | `packages/client/ui-plugin-manager/src/client/index.ts:113`, `:141` |
| Primary button fill/hover and foreground tokens exist in both themes | `packages/client/ui-theme/src/styles/design-platform.css:204`, `:205`, `:220`, `:322`, `:323`, `:338` |

The browser integration verifies the Fetch route through real saves and refreshes. Unit tests verify lifecycle disposal and model/UI data sharing. Real model calls and installation evidence are recorded separately in [verification](verification.md).
