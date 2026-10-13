---
kind: package-reference
description: 学习数据所有权、生命周期、传输与生成的浏览器模块。
---
# 运行架构

[English](runtime.md) | 中文

## 概述

浏览器和 Agent 工具操作同一份 Host 学习台。浏览器持有可丢弃的缓存，Host 校验并串行写入，持久域在重启后保留。没有新增 Session 事件类型。

## 目录

- [数据与传输](#data-and-transport)
- [生命周期与恢复](#lifecycle-and-recovery)
- [客户端生成](#client-generation)
- [平台证据](#platform-evidence)

<a id="data-and-transport"></a>

## 数据与传输

`learning_desk` 版本 1 保留原有八张表和设置 global，不改变 schema。`learning_desk_runtime` 版本 1 保存活动计时分段和当前本地日期的复习计数。只有 Host 写这些域。JSON 备份包含学习表及设置；导入重置每日复习计数，不恢复活动计时器。

浏览器调用同源 GET/POST `/api/learning-desk`，路由注册到 `ctx.connection.fetch`。宿主传输负责认证、请求准入和缓冲。GET 返回 `{ok:true,value}`，包含全部学习数据和运行状态投影；POST 接受经过校验的 `put`、`delete`、`settings`、`import`、`review` 或 `timer` 命令。失败返回 `{ok:false,code,message}`，不暴露路径或调用栈。这是认证 Fetch 路由，没有注册自定义 RPC 命名空间。

四个工具通过 `ctx.tools.register` 注册并调用同一服务。结果为标准 `{ok,text}` 值，含可读 JSON 和纯通用展示器。笔记制卡先返回指定笔记，再接受 1–100 个非空问答对。模型内容质量和依据由调用方负责。

每日计划只保存显式覆盖，生成的时间块由课表和任务重新计算。统计采用本地日历日期、已完成且非休息的专注记录，以及任务当前的课程和标签关联。修改任务标签也会改变历史标签分布。UI 中课程结束时间必须晚于同日的开始时间。

<a id="lifecycle-and-recovery"></a>

## 生命周期与恢复

一个 promise 队列在插件实例内串行执行读写。加载失败拒绝激活。卸载拒绝新工作，等待已接受工作后关闭两个域；路由、工具 effect 和浏览器轮询及订阅也会释放。插件卸载时中止浏览器请求。

写入失败可能发生在前面记录已提交之后。服务将学习台标记为不确定，并拒绝后续依赖操作直到重启。替换导入先校验全部表、重复标识符、设置和卡片与卡组关联，再删除记录；后端操作是逐条执行，不是多表事务。替换或清空前先导出。

计时状态变更持久保存 epoch 时间戳和累计活动分段。倒计时经过时长受设置的目标限制。结束时按本地午夜拆分，采用稳定的计时器/日期标识符写入，重试结束不会重复记录。离线期间到期的计时器在 Host 下一次读取时结算。暂停区间和休息不增加学习分钟。

旧浏览器 JSON `dsh.learning-desk.v1` 只读，不覆盖也不删除。有效和损坏的备份都提供导出操作，由用户显式把有效备份导入 Host。浏览器已无学习数据写入路径。

<a id="client-generation"></a>

## 客户端生成

`npm run build` 从 `src/ui/entry.js` 遍历可达模块，按相对路径排序，在宿主加载器 factory 内写入模块注册表。React 通过 `require('react')` 取得，不接受其他裸导入。已提交的文件不含时间戳和绝对路径。

支持带别名的具名导入、命名空间导入、导出的 function/const/let/class 声明，以及独立成行且无别名的具名导出列表。默认或副作用导入、动态导入、默认/星号/再导出/别名/async 导出、循环和源目录之外的导入，均报文件名及行号。这是受限源码内联器，不是通用 JavaScript 打包器。

<a id="platform-evidence"></a>

## 平台证据

证据来自联调用的 Harness checkout，版本为 `0.2.1-alpha.2-d743267`；后续平台版本可能需要重新验证。

| 事实 | Harness 权威源码 |
| --- | --- |
| 共享 Fetch 请求由宿主认证及准入 | `packages/client/connection/src/index.ts:116`, `:142`, `:150` |
| 全局工具注册由 effect 持有 | `packages/core/tools/src/index.ts:1064`, `:1069`, `:1091` |
| 内置插件管理页使用属主侧栏及主区域槽位 | `packages/client/ui-plugin-manager/src/client/index.ts:113`, `:141` |
| 主按钮填充、悬停和前景 token 在两种主题中都存在 | `packages/client/ui-theme/src/styles/design-platform.css:204`, `:205`, `:220`, `:322`, `:323`, `:338` |

浏览器联调用真实保存和刷新验证 Fetch 路由。单测验证生命周期释放以及模型/UI 共用数据。真实模型调用与安装证据分别记录在[验证记录](verification.md)。
