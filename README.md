---
kind: package-bundle
description: Plan classes and tasks, record focus time, and review notes inside the DeepSeek Harness Web GUI.
---
# Learning Desk

English | [中文](README.zh.md)

## Summary

Learning Desk adds five sections to the DeepSeek Harness Web GUI: Today, Plan, Knowledge, Stats, and Settings. Combine a weekly timetable with tasks, keep a focus timer running across pages, and turn notes into spaced-repetition cards. Learning data stays on your local DSH Host and can be exported as JSON. Four Agent tools read and update the same data.

![Learning Desk in the real DSH Web GUI](docs/screenshots/learning-desk.jpg)

## Table of Contents

- [Install](#install)
- [Use the desk](#use-the-desk)
- [Development](#development)
- [Implementation](#implementation)
- [Limitations](#limitations)
- [License](#license)

<a id="install"></a>

## Install

Use a DSH Web profile that already includes the base and Web app bundles. This plugin targets the Web GUI; it does not contribute a native Desktop panel.

1. Add the plugin to your Web profile:

   ```sh
   dsh plugin --profile web add github:2723191422-lab/-DeepSeek-Harness-
   ```

2. Restart that profile when installation reports `restart-required`:

   ```sh
   dsh --profile web --no-open --host 127.0.0.1 --port 19399
   ```

3. Open the launch URL printed by DSH, then select **Learning Desk** in the sidebar. Set the semester start date in **Settings** before expecting classes in the day plan.

For a local checkout, use `dsh plugin --profile web add ./dsh-learning-desk`. Installation consumes the committed `client.js`; users need no build tools. The only runtime dependency is `zod`.

<a id="use-the-desk"></a>

## Use the desk

| Section | Available actions |
| --- | --- |
| Today | Capture a task with `#tags`, inspect the composed timeline, move or hide a block, handle overflow, and start focus |
| Plan | Add courses with week ranges and odd/even weeks, preview pasted timetable text, import or undo a batch, and edit tasks and subtasks |
| Knowledge | Search Markdown notes and relationships, manage cards and decks, flip and grade due cards with keys 1–4, and save resources with reading progress |
| Stats | Inspect actual focus minutes, goal streaks, task completion, course/tag distributions, a 12-week heatmap, and a 30-day trend with details |
| Settings | Set goals, timer presets, the daily review limit, semester and week starts, and export or replace learning data with JSON |

The timer persists start/pause/resume transitions on the Host. Countdown sessions stop at their target, including after sleep; count-up sessions continue until you finish. Completed focus is split at local midnight, and breaks do not contribute to study time or goal streaks.

The Agent can call `learning_desk_today`, `learning_desk_add_task`, `learning_desk_plan_day`, and `learning_desk_cards_from_note`. The last tool first returns the note; the Agent then supplies question/answer pairs to save. These tools require the plugin to be loaded in the active profile.

Export a backup before importing or clearing data. Replacement import validates all records before deleting existing records. If storage fails during a multi-record write, some records may already have been saved: editing stops, the interface reports the uncertainty, and you must restart the Host and inspect its data before continuing.

<a id="development"></a>

## Development

Use Node 24 and install dependencies in this repository itself; an ancestor's `node_modules` must not supply `zod` during acceptance.

```sh
npm ci --no-audit --no-fund
npm run build
npm run check
npm test
git diff --exit-code client.js
```

Edit `src/ui/**` and regenerate `client.js`; do not hand-edit the generated file. The deterministic inliner supports the restricted ESM syntax documented in [runtime architecture](docs/runtime.md). CI regenerates the file and rejects drift. Restart a running Host after changing loaded plugin code.

The original domain algorithms and the eight-table storage schemas remain the shared authority. Tests cover schema/creator alignment, import validation, Host/tool/UI data sharing, timer recovery, local midnight, review limits, cancellation, and stale polling replies. See [Contributing](CONTRIBUTING.md) and [verification evidence](docs/verification.md).

<a id="implementation"></a>

## Implementation

<details>
<summary>Source map</summary>

| Path | Ownership |
| --- | --- |
| `index.js`, `src/host/` | Authenticated HTTP route, four tools, serialized writes, and timer/review metadata |
| `src/domain/`, `src/storage/` | Existing domain algorithms and zod-validated learning tables |
| `src/ui/` | React views, bilingual copy, host-theme CSS, and Host-backed cache |
| `scripts/build-client.mjs`, `client.js` | Deterministic development generator and committed browser module |
| `cordis.patch.yml`, `locale/`, `icon.svg` | Profile composition and Plugin Manager metadata |
| `tests/`, `.github/workflows/ci.yml` | Dependency-free test infrastructure and clean-clone checks |

The browser obtains React from the host module loader and contributes owner-scoped slots. It writes no learning data to browser storage. See [runtime architecture](docs/runtime.md) and the [upgrade guide](docs/upgrade-guide/v0.1.0/host-data/guide.md).

</details>

<a id="limitations"></a>

## Limitations

Courses use same-day time ranges; the week grid displays 08:00–22:00, with all courses also accessible in the list. Markdown is displayed as escaped source text. Timetable input supports manual entry and pasted text, not spreadsheets or OCR. There is no cross-device sync, account service, or background notification service.

JSON exports contain the eight learning tables and settings; active timers and daily review counters are Host metadata and are excluded. Imports cannot run while a timer is active. Old browser backups are preserved for explicit export and import; they are not silently migrated. A countdown that expires while the Host is stopped is recorded on the next read after restart. Sleep recovery is tested with an injected clock; physical laptop sleep is not claimed as verified.

<a id="license"></a>

## License

[MIT](LICENSE).
