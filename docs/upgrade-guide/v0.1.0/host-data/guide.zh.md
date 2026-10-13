---
kind: upgrade-guide
description: 个人学习台现在依赖 Host connection/tools 服务，并将学习数据保存在 Host。
---
# Host 持有学习数据

[English](guide.md) | 中文

## 变更

个人学习台 1.0 在 Web profile 中需要 `storageDomain`、`connection` 和 `tools`。0.1 面板骨架仅需要存储。缺少 Web connection 服务的 profile 无法激活完整插件。原有 `learning_desk` 版本 1 表及设置保持原 schema。

早期实验浏览器备份不再是实时数据源。插件读取 `dsh.learning-desk.v1` 供显式备份恢复，只向 Host 写学习数据。活动计时和每日复习元数据单独保存，不包含在可携带的 JSON 导出中。

## 迁移

1. 使用包含 DSH 基础及 Web app bundle 的 profile，安装新插件并重启 Host。
2. 打开学习台。若检测到旧浏览器备份，先导出再做其他操作。损坏备份仍可导出供恢复。
3. 在设置中导出当前 Host 数据。结束活动计时后，只有确定要替换 Host 学习表时，才预览并确认有效的旧 JSON 导入。
4. 重新打开面板或刷新浏览器。确认课程、任务、笔记和卡片仍在，并设置学期起始日，让课表进入每日计划。
