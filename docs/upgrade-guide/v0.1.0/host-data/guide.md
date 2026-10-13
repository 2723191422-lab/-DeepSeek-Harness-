---
kind: upgrade-guide
description: Learning Desk now requires Host connection/tools services and stores learning data on the Host.
---
# Host-owned learning data

English | [中文](guide.zh.md)

## Change

Learning Desk 1.0 requires `storageDomain`, `connection`, and `tools` in a Web profile. The 0.1 panel skeleton required only storage. A profile without the Web connection service cannot activate the full plugin. Existing `learning_desk` version 1 tables and settings retain their schemas.

Older experimental browser backups are not the live data store. The plugin reads `dsh.learning-desk.v1` for explicit backup recovery and writes learning data only to the Host. Active timer and daily review metadata are separate and are excluded from portable JSON exports.

## Migration

1. Use a profile containing the DSH base and Web app bundles; install the new plugin and restart the Host.
2. Open Learning Desk. If an older browser backup is detected, export it before doing anything else. Corrupt backups remain available for recovery.
3. Export current Host data from Settings. Stop any active timer, then preview and confirm a valid older JSON import only if you intend to replace the Host learning tables.
4. Reopen the panel or refresh the browser. Confirm courses, tasks, notes and cards are present, and set the semester start date so the timetable enters the day plan.
