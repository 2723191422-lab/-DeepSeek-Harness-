> 本文保留初版设计依据；当前实现、数据所有权和验证范围以 [运行架构](runtime.zh.md) 和 [验证记录](verification.md) 为准。

# 个人学习台 · DSH 插件规格 v0.2

| 字段 | 值 |
| --- | --- |
| 状态 | 平台已确定，功能范围待冻结 |
| 平台 | DeepSeek Harness 插件（Host bundle + Web Client 面板） |
| 前序文档 | [01-features-and-ui-design.md](01-features-and-ui-design.md)（平台无关设计稿，v0.1） |
| 本版变化 | 依据 DSH 真实插件契约，把 v0.1 的平台无关设计收敛为可实施规格 |
| 日期 | 2026-10-12 |

> v0.1 假设「平台未定」；平台已定为 DSH。**平台无关设计中的一部分在此被推翻**——DSH 的外部插件 UI 有硬约束，本文件优先于 v0.1。

---

## 1. 平台事实（每条带证据，无证据的另行标注）

| # | 事实 | 证据 | 对设计的影响 |
| --- | --- | --- | --- |
| P1 | Host-only bundle 零依赖、零构建、零安装脚本即可运行 | `packages/preset/agent-preset/skills/cordis-plugin-development/references/host-plugin.md:7` | 可以做成一个不装任何 npm 依赖的 GitHub 仓库 |
| P2 | 插件包靠 `package.json` 的 `dsh.bundle.patch` 声明，patch 里一行 `insert` | 同上 `:9-27`；模板 `templates/decoration/cordis.patch.yml:1-3` | 仓库根就是包根，不需要 monorepo |
| P3 | Web UI 半边是**手写**的 `client.js`：`window.__ModuleLoader__.load({ id, factory(require){} })`，React 从浏览器模块表 `require` | `templates/decoration/client.js:1-22`；`references/ui-plugin.md:9` | **不需要任何打包工具**。这对「发到 GitHub」是决定性利好 |
| P4 | 混合形态：`package.json` 同时声明 `dsh.bundle.patch` 与 `dsh.client`，并导出 `./client` | `templates/decoration/package.json:1-21` | 一个包同时提供 Host 能力与 GUI 面板 |
| P5 | UI 只能通过 slot 贡献：`ctx.slots.inject(ownerKey, () => ctx.slots.register(...))`；**禁止 iframe 托管页面** | `references/practices.md:33,36` | 面板必须是 slot 里的 React 组件；不能用自建 HTML 页面绕过宿主主题 |
| P6 | 样式只能用 `--dsw-alias-*` 语义 token，字面颜色仅限插画 | `references/practices.md:34` | 自动跟随宿主浅色/暗色；不能自带配色系统 |
| P7 | **禁止** `require('@deepseek-ai/dsh-client-ui-primitives')` 或任何 Harness 客户端包；要复制宿主控件的标记与行为，只保留 token 依赖 | `references/practices.md:35` | 控件必须自建；`dsh.client.inject` 只用于激活排序，不提供模块 |
| P8 | 纯 JS 插件**没有类型检查**；组件抛错会直接让该 slot 条目空白（console: `slot entry crashed in '<slot>'`） | `references/practices.md:35` | 工程健康度必须靠纯函数单测 + CI 补回来；UI 必须有错误边界 |
| P9 | 可见文案走 Client locale 服务；显示元数据读 `locale/*.json` 的 `meta.title` / `meta.description` | `references/ui-plugin.md:13`；`host-plugin.md:31-33` | 中英双语是硬要求，不是加分项 |
| P10 | 不要新增 session event type；插件自有数据放 storage 服务 | `references/practices.md:21` | 学习数据不能塞进 session 日志，要走 storage domain |
| P11 | 安装入口统一：`plugin_manager.install_bundle`，或命令 `dsh plugin --profile <name> add github:you/repo` | `host-plugin.md:68`；`docs/user/develop/basic/publish.md:164` | GitHub 直装是官方路径，不是野路子 |
| P12 | 图标 SVG/PNG/JPEG/WebP ≤ 256 KiB，必须在包内 | `host-plugin.md:51` | 需要一个原创图标 |
| P13 | 版本门禁：拿包自身 `peerDependencies` 里 `@deepseek-ai/dsh*` 的 range 对比运行时版本，不匹配**整包跳过** | `packages/boot/app-boot/README.md:52` | 零 dsh 依赖 = 不触发门禁；这是选零依赖形态的第二个理由 |
| P14 | 安装新 bundle 可经 HMR 激活；**替换已安装包必须重启**才能加载新的 JS 模块代 | `host-plugin.md:70` | 开发期要接受「改 host 半边需重启」 |

**未验证项**（实现阶段必须先确认，不得凭本文件下结论）：

| # | 未验证 | 验证方式 |
| --- | --- | --- |
| U1 | 外部插件能否注入 `sidebar.panellist` 与 `main` keyed slot（证据只覆盖仓库内包） | 实现阶段用 `Slots.listSubTree` 读实际 slot 树 |
| U2 | 外部插件如何提供 client↔host 的 RPC 通道（`ctx.remote.<ns>` 的注册侧） | 读 `docs/api-gateway.md` + `cordis_inspect_query Service` |
| U3 | `dsh.client.external` 的确切语义与 baseline 模块清单 | `references/ui-plugin.md:9` 只给了一句 |

---

## 2. 功能范围

### 2.1 用户已确认的核心场景

| 来源 | 需求 |
| --- | --- |
| 勾选 | 今日学习计划 + 打卡 |
| 勾选 | 番茄钟 / 专注计时 |
| 勾选 | 间隔重复复习提醒 |
| 勾选 | 资源收藏与标签管理 |
| 文字补充 | 每日任务安排与计划；**导入个人课表**；基于课表 + 自己的安排自动生成每日 schedule |

### 2.2 v1.0 功能表

| ID | 功能 | 用户价值 | 成本 | 依赖 |
| --- | --- | --- | --- | --- |
| F1 | 课表管理（周视图 + 增删改 + 周次规则） | 一次性录入，长期复用；一切排程的输入源 | M | — |
| F2 | 课表导入（手动录入 + 粘贴文本解析） | 把教务系统的复制粘贴变成结构化数据，消灭录入门槛 | M | F1 |
| F3 | 每日日程自动合成（课表 ∩ 日期 ∪ 任务 → 时间轴，可手动覆盖） | **核心差异化**：打开就知道今天几点做什么 | L | F1, F4 |
| F4 | 任务与待办（分组、日期、预估时长、子任务） | 把"学习"拆成可勾选单元 | M | — |
| F5 | 番茄钟 / 专注计时（自定义时长、正计时兜底、切页不丢） | 把计划变成真实投入，是统计的唯一原始数据源 | M | F4 |
| F6 | 打卡与连续天数（**由专注记录派生**，不单独存储） | 维持动力的正反馈，同时避免双份真相 | S | F5 |
| F7 | 笔记（Markdown、标签、关联任务/课程） | 学了就记，可检索 | M | F4 |
| F8 | 复习卡 + 间隔重复（SM-2 简化版） | 把"记过"变成"记住" | L | F7 |
| F9 | 资源收藏（链接/书/课，标签 + 阅读状态） | 统一收口学习资料 | S | — |
| F10 | 统计（热力图、时长分布、完成率、连续天数） | 用数据识别投入结构问题 | M | F5, F6 |
| F11 | 设置（每日目标、番茄参数、复习上限、学期起始周、数据导入导出） | 贴合个人节奏 + 数据主权 | S | — |
| F12 | 中英双语 + 元数据 locale | 开源发布后接受外部贡献的前提 | S | 全部 |

**成本口径**：S ≤ 2 人日，M = 3–6 人日，L = 6–10 人日。合计约 **22–30 人日**。

### 2.3 v1.0 明确不做

| 砍掉 | 理由 |
| --- | --- |
| 跨设备同步 / 后端 | 与"一个可发布的插件"目标冲突，工作量翻倍且引入运维 |
| 账号体系 | 单用户本地工具，账号无收益 |
| 富文本编辑器 | Markdown 覆盖 95%，富文本成本翻倍 |
| 截图 OCR 导入课表 | 识别错误率不可控，先把文本粘贴做扎实 |
| 双向链接与知识图谱 | 需要图数据规模支撑，v1.0 数据量不足以产生价值 |
| 移动端布局 | DSH Web GUI 是桌面场景，投入产出比低 |
| 通知推送 | 宿主控制通知权限，降级为"打开时聚合提示" |

---

## 3. 数据模型

存储位置：插件自有 storage domain（P10），**不写入 session 日志**。

| 实体 | 关键字段 | 说明 |
| --- | --- | --- |
| `Course` | id, name, teacher, location, weekday, start, end, weeks{from,to,parity}, color, note | 课表条目；`weeks` 支持单双周 |
| `Task` | id, title, courseId?, date?, estimateMin, spentMin, status, priority, tags[], subtasks[], order | `date` 为空 = 待排池 |
| `DayPlan` | date, blocks[], overrides[] | 合成结果 + 用户手动覆盖；**可重算，不存派生字段** |
| `FocusRecord` | id, taskId?, courseId?, start, durationMin, mode, completed | 计时的唯一真相源 |
| `Note` | id, title, markdown, tags[], linkTaskIds[], linkCourseIds[], createdAt, updatedAt | — |
| `Card` | id, deckId, front, back, ease, intervalDays, due, lapses, reps | SM-2 简化版状态 |
| `Deck` | id, name, courseId?, description | 卡片分组 |
| `Resource` | id, title, url, kind, tags[], status, progress, note | 收藏；`kind` = link/book/course/video |
| `Settings` | dailyGoalMin, pomodoroMin, breakMin, reviewLimit, termStartDate, weekStartsOn, theme | 学期起始周决定周次解析 |

### 3.1 两条关键设计决定

1. **打卡不落库，走派生。** 连续天数与打卡状态由 `FocusRecord` + `Task` 完成态实时计算。存一份打卡表 = 制造第二真相源，二者必然漂移。
2. **`DayPlan` 可重算，不做增量维护。** 课表或任务一变，当日计划整体重算，只叠加用户的显式覆盖（拖拽调整、删块）。增量维护是 bug 温床，重算函数是纯函数，可单测。

---

## 4. 核心算法：课表 → 每日日程

### 4.1 周次解析

| 输入 | 规则 |
| --- | --- |
| 学期起始日（周一） | `Settings.termStartDate` |
| 条目周次 | `{ from, to, parity }`，`parity ∈ {all, odd, even}` |
| 目标日期 | 计算 `weekIndex = floor((date - termStart) / 7) + 1` |
| 命中判定 | `from ≤ weekIndex ≤ to` 且 parity 匹配，且 `date.weekday === course.weekday` |

### 4.2 日程合成（纯函数，可单测）

```
composeDayPlan(date, courses, tasks, settings):
  1. 固定块 = 命中该日期的 courses 全部条目
  2. 待排任务 = tasks 中 date === date 的未完成项
              ∪ date 为空且 status === todo 的项（按 priority / order 取用）
  3. 空闲区间 = [dayStart, dayEnd] 减去固定块与已有覆盖
  4. 依次把待排任务按其 estimateMin 填入空闲区间；放不下则留在"待办池"
  5. 空闲尾部不足 15min 的碎片不分配（避免制造无法执行的小块）
  6. 叠加用户覆盖：被删除的块不复活，被移动的块保持新位置
  返回 { fixed[], scheduled[], overflow[], freeMinutes }
```

**边界 case 必须在单测里覆盖**：单双周错位、跨天时间、课表重叠、estimateMin 大于最长空闲、学期起止外日期、覆盖后与新任务冲突。

---

## 5. UI 设计（DSH 原生落地）

### 5.1 挂载与导航

| 项 | 决定 |
| --- | --- |
| 入口 | slot `sidebar.panellist` 注册一个入口项（图标 + 本地化标题） |
| 本体 | slot `main` 的 keyed 面板，`MainPanelId` 用插件自己的品牌 id |
| 激活 | `ctx.slots.inject(ownerKey, () => ctx.slots.register(...))`，owner 收起时自动注销（P5） |
| 一级导航 | **5 个**：今日 / 计划 / 知识 / 统计 / 设置 |

| 导航 | 承载 |
| --- | --- |
| 今日 | 日程时间轴（课表块 + 任务块）、当前专注卡片、番茄钟、进度环、快速捕获、连续天数 |
| 计划 | 周视图课表（可编辑、单双周着色）、课表导入、任务清单（按日/周编排）、待排池 |
| 知识 | 三个 tab：笔记 / 复习卡 / 资源收藏 |
| 统计 | 热力图、时长分布、完成率、科目占比、连续天数 |
| 设置 | 学习参数、学期起始周、外观、数据导入导出、快捷键 |

> 超过 5 个一级导航时，"任务"与"资源"曾独立成页；合并进「计划」与「知识」后导航回到 5 个。**课表不是独立页**——它属于「计划」，因为课表的价值在排程而不在展示。

### 5.2 设计方向落地：v0.1 方向 C → 宿主 token

v0.1 推荐「方向 C 静默留白 + 方向 B 暗色变体」。在 DSH 上**两个方向的最终形态都由宿主决定**：插件不持有配色，只引用语义 token。

| 用途 | v0.1 取值（废弃） | DSH 落地（采用） |
| --- | --- | --- |
| 页面背景 | `#FFFFFF` | `--dsw-alias-bg-base` |
| 卡片/分层表面 | `#F7F8FA` | `--dsw-alias-bg-layer-1` / `-layer-2` / `-layer-3` |
| 浮层 | `#FFFFFF + shadow-md` | `--dsw-alias-bg-overlay` |
| 边框 | `#E5E7EB` | `--dsw-alias-border-l1` … `-l4` |
| 主文本 | `#111827` | `--dsw-alias-label-primary` |
| 次文本 | `#4B5563` | `--dsw-alias-label-secondary` |
| 弱文本 | `#6B7280` | `--dsw-alias-label-tertiary` |
| 极小字/说明 | — | `--dsw-alias-label-caption` |
| 强调色 | 靛蓝 `#4F46E5` | `--dsw-alias-brand-primary` / `--dsw-alias-link` |
| 悬停/按下 | 手写 hover | `--dsw-alias-interactive-bg-hover` / `-active` |
| 主按钮 | 手写 | `--dsw-alias-button-primary-fill` / `-hover` |
| 成功 | `#047857` | `--dsw-alias-state-success-primary` / `-secondary` |
| 错误/危险 | `#B91C1C` | `--dsw-alias-state-error-primary` / `-secondary` |
| 圆角 | 4/8/12px 自定 | `--dsw-radius-xs` / `-sm` / `-md` / `-lg` / `-xl` / `-panel` |
| 字体 | 自选系统栈 | `--dsw-font-family` |

**结论**：v0.1 的「方向 A 纸感书桌 / 方向 B 焦点网格 / 方向 C 静默留白」三选一在 DSH 上**不成立**——插件不拥有配色权（P6）。方向 C 的**布局与层级语言**（留白、层级靠 bg-layer 而非阴影、单一强调色）保留，配色全部让位给宿主 token。这是本次设计中唯一被平台推翻的 v0.1 结论。

**间距没有 token**（宿主用字面 px），按 4px 基准自定：4/8/12/16/24/32。

### 5.3 组件清单（全部自建，因为 P7 禁止引用宿主组件包）

| 组件 | 用途 | 必须保留的宿主行为 |
| --- | --- | --- |
| `Button` | 主/次/幽灵三态 | `disabled`、键盘可达、`:focus-visible` 环 |
| `Checkbox` | 任务完成 | 热区 ≥ 44×44；完成态加图标，不只靠颜色 |
| `Modal` | 任务/卡片/课表条目编辑 | 焦点陷阱、Esc 关闭并把焦点归还触发元素 |
| `Menu` | 排序、筛选、批量操作 | 方向键导航、Esc 关闭 |
| `Tabs` | 「知识」三 tab | `role="tablist"` + 方向键切换 |
| `Tag` | 标签、科目 | 可删除时提供 `aria-label` |
| `ProgressRing` | 今日目标进度 | 文本替代：`aria-label` 报百分比 |
| `Heatmap` | 12 周热力图 | 每格可聚焦 + `title`，色阶外附加数值 |
| `EmptyState` | 空态 | 文案必须说"下一步做什么"，禁用"暂无数据" |
| `Toast` | 保存/失败反馈 | 成功 `role="status"`、失败 `role="alert"`，最多 3 条 |
| `ErrorBoundary` | **必需**（P8） | 组件抛错不能清空整个 slot；降级为局部错误卡 |

复制宿主控件时：**类名加插件前缀，只保留 `--dsw-alias-*` 引用**（P7）。

### 5.4 计时器的窄容器降级

| 容器宽度 | 行为 |
| --- | --- |
| ≥ 768px | 今日页内联卡片 |
| < 768px | 降级为**底部常驻条**，任何页面都能看到并操作 |

计时状态机必须覆盖：切换面板、宿主刷新、系统休眠。落盘粒度 ≤ 5 秒，恢复时按 `start + 已过时长` 重建，避免休眠期间丢时长。

---

## 6. 工程基线（技术栈推荐）

### 6.1 结论：零构建、单一运行时依赖的纯 JS bundle

> **v0.2 初稿把这里写成「零运行时依赖」，是错的。** 存储域 schema 强制是 zod，下面这版才是事实。

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 构建 | **无** | P1 + P3：Host 半边是 ESM `apply()`，Client 半边是手写 factory。仓库 clone 即运行 |
| Harness 依赖 | **零** | 不得依赖任何 `@deepseek-ai/*`：P13 的版本门禁会因 peer range 不匹配把**整包跳过**（`packages/boot/app-boot/README.md:52`）。这才是真正要守的约束 |
| npm 运行时依赖 | **仅 `zod ^4.4.3`** | DSH 存储域 schema 强制是 zod：`DomainTableSpec.valueSchema: ZodType<V>`（`packages/storage/storage-domain/src/spec.ts:29`）。zod 是普通 npm 包，不进版本门禁 |
| Harness 包 | **不 import `@deepseek-ai/dsh-storage-domain`** | `defineDomain` 只是身份校验助手（`spec.ts:107-135`），`domainTable` 就是 `{ valueSchema }`（`spec.ts:91-93`）。本地约 10 行等价实现即可，换来「零 dsh 依赖」 |
| domain / 表命名 | 只能匹配 `[a-z][a-z0-9_]*` | `UNIT_NAME_RE`（`packages/storage/storage/src/backend.ts:10`）**不允许连字符** → domain 名是 `learning_desk`，不是 `learning-desk` |
| 类型 | 无 TS | 引入 TS 就要引入构建链，与「GitHub 直装」冲突。**用单测补回类型检查缺失的收益** |
| 测试 | Node 内置 `node --test` | 本机 node v24.15.0。**`node --test tests/` 在 Node 24 无效**：位置参数是 glob，`tests/` 命中目录本身并报 `Cannot find module`。用 `node --test` |
| CI | GitHub Actions | `npm install` → `validate-manifest.mjs` → `node --check` ×2 → `node --test` |
| 版本 | semver + git tag | 发布形态 |

**必须记住的一个陷阱**：插件目录位于 DSH 仓库内时，`zod` 会由**上层仓库的 `node_modules`** 解析到。这种「本地绿」是假象——CI、`/tmp` 副本、用户 profile 安装都没有这个祖先目录。本仓库已执行 `npm install` 并提交 `package-lock.json`；任何判绿之前先确认 `node_modules/zod` 真实存在。

### 6.2 代码共享：唯一的技术不确定点

**问题**：Host 半边（`index.js`）可以 `import` 本地 ESM 模块；Client 半边（`client.js`）是 `factory(require)` 闭包，只能 `require` 浏览器模块表里的 baseline 模块（React 等），**无法 import 仓库内的 `src/*.js`**。两边都需要同一份纯逻辑（周次解析、日程合成、SM-2、统计聚合）。

| 方案 | 做法 | 评价 |
| --- | --- | --- |
| **方案 1（推荐）** | 纯逻辑只写在 `src/domain/*.js`（ESM，可被 `node --test` 与 `index.js` 直接 import）；用一个约 40 行的零依赖脚本 `scripts/build-client.mjs` 把需要共享的模块内联进 `client.js` 的 factory；生成物入库，CI 校验「重新生成后无 diff」 | 单一真相源；生成物可审查；代价是一个零依赖脚本 + 一条 CI 校验 |
| 方案 2 | Host 侧持有全部逻辑，Client 通过 RPC 读计算好的视图 | 可行但交互延迟高（勾选任务、翻卡都要往返），且 U2 未验证 |
| 方案 3 | 两边各写一份 | **否决**：算法必漂移 |

**方案 1 的状态**：U1 已从「未验证」降级为「源码级确认」，方案 1 的先决条件已满足（见 §9.1）。当前 `client.js` 是手写的，**还没有内联任何 `src/domain/**` 模块**——因为面板目前只有导航骨架。等「今日」页真正需要日程合成时再引入 `scripts/build-client.mjs`；`src/domain/schedule.js` 已经 `import` 了 `./term-weeks.js`，所以那个脚本必须能解析相对 import，不能只做字符串拼接。

### 6.3 测试策略

| 层 | 内容 | 工具 |
| --- | --- | --- |
| 纯逻辑单测 | 周次解析、日程合成、SM-2、连续天数、统计聚合、导入解析 | `node --test` |
| 契约自检 | `package.json` / `cordis.patch.yml` / `locale/*.json` 可解析；`files` 覆盖全部运行时文件；中英 locale key 完全对齐；图标体积与格式合法 | CI 脚本 |
| 生成物一致性 | 重新生成 `client.js` 后 `git diff --exit-code` | CI |
| 手工验收 | 安装进 profile，逐页核对渲染、暗色切换、计时跨页、错误边界 | 安装检查清单 |

**不做**：GUI 快照测试（宿主仓库的门禁只覆盖自身路径，外部插件吃不到这套基建）。

### 6.4 仓库结构

```
dsh-learning-desk/
├── package.json              # dsh.bundle.patch + dsh.client + exports + files
├── cordis.patch.yml          # - insert: [{ id, name }]
├── index.js                  # Host 半边：storage domain + Tools + Config
├── client.js                 # Web 半边：slot 注册 + React 视图（由脚本生成）
├── icon.svg
├── locale/en.json            # meta.title / meta.description
├── locale/zh.json
├── src/
│   ├── domain/               # 纯逻辑，无副作用，可单测
│   │   ├── term-weeks.js     # 周次解析
│   │   ├── schedule.js       # 日程合成
│   │   ├── srs.js            # SM-2
│   │   ├── stats.js          # 聚合与连续天数
│   │   ├── import-parser.js  # 粘贴文本 → 课表条目
│   │   └── models.js         # 实体构造与校验
│   ├── storage.js            # storage domain 定义与读写
│   ├── ui/                   # 视图与组件（生成 client.js 的输入）
│   └── i18n.js               # 中英字典
├── scripts/build-client.mjs  # 零依赖拼接脚本
├── tests/                    # node --test
├── docs/01-features-and-ui-design.md
├── docs/02-dsh-plugin-spec.md
├── .github/workflows/ci.yml
├── README.md / README.zh.md
├── LICENSE (MIT) / CHANGELOG.md / CONTRIBUTING.md
└── .gitignore / .editorconfig
```

### 6.5 发布路径

| 步骤 | 命令 / 动作 |
| --- | --- |
| 本地验证 | `dsh plugin --profile dev add ./dsh-learning-desk` |
| GitHub 直装 | `dsh plugin --profile dev add github:<you>/dsh-learning-desk` |
| 或经面板安装 | `plugin_manager` 的 `install_bundle` |
| npm（可选） | `pnpm publish`（零构建，直接发源码文件） |
| 版本 | git tag `v1.0.0` + GitHub Release，附安装说明与截图 |

---

## 7. 里程碑

| 阶段 | 交付 | 验收信号 |
| --- | --- | --- |
| M0 · 可行性验证 | 最小混合 bundle（模板骨架 + 一个能显示文字的 slot 面板）装入 profile | **U1 得到证实或推翻**；此前不动业务代码 |
| M1 · 仓库骨架 | 上面全部工程文件 + CI 绿 | CI 在干净 clone 上通过 |
| M2 · 数据层 | storage domain + 全部纯逻辑 + 单测 | `node --test` 覆盖 §4.2 全部边界 case |
| M3 · 今日与排版 | 课表管理、粘贴导入、日程合成、今日时间轴 | 录入一学期课表后日程正确；单双周验证通过 |
| M4 · 专注与打卡 | 番茄钟 + FocusRecord + 连续天数 | 切面板/休眠后计时不丢 |
| M5 · 知识与复习 | 笔记、卡片、SM-2、资源收藏 | 复习到期数正确；翻卡与评分可用 |
| M6 · 统计与设置 | 热力图、分布、参数、导入导出 | 导出后重装可完整恢复 |
| M7 · 打磨与发布 | 中英双语、空态、暗色、错误边界、README/GIF | 暗色模式无硬编码颜色残留；README 含安装三步 |

---

## 8. 已冻结的范围决定

| # | 问题 | 决定 | 生效范围 |
| --- | --- | --- | --- |
| Q1 | 课表怎么进系统 | **手动录入 + 粘贴文本解析**，两条都做；CSV/Excel 与截图 OCR 不做 | F1、F2 |
| Q2 | 是否让 Agent 直接操作学习台 | **v1.0 就做**：暴露 Tools，让 Agent 读今日日程、拆任务、从笔记生成复习卡 | F13（新增） |
| Q3 | 一级导航 | **今日 / 计划 / 知识 / 统计 / 设置**，5 个 | §5.1 |

### 8.1 Q2 带来的新增范围

| ID | 功能 | 用户价值 | 成本 |
| --- | --- | --- | --- |
| F13 | Agent Tools：`learning_desk_today`（读今日日程）、`learning_desk_plan_day`（重排一天）、`learning_desk_add_task`、`learning_desk_cards_from_note`（从笔记生成复习卡） | 用自然语言驱动学习台；DSH 独有优势，其他平台的同类工具做不到 | M–L |

**F13 的约束**（来自平台事实，不得违反）：

- P10：不得新增 session event type；Tools 读写插件自有 storage domain。
- Tools 是注册项，随插件卸载而注销（`ctx.effect`）。
- 工具结果必须可读、可诊断；不得把内部错误原样抛给模型。

**F13 把成本从 22–30 人日推到约 26–36 人日。**

---

## 9. 诚实披露

1. **U1 已从「未验证」降级为「源码级确认」**：`sidebar.panellist` 是普通 list slot（`packages/client/ui-sidebar/src/client/index.ts:83`），`main` 是 keyed slot（`packages/client/ui-layout/src/client/index.ts:73,183`），二者都走普通 `ctx.slots` 服务，**没有任何「仅限宿主包」门禁**（宿主自己的 `ui-plugin-manager` 用的是同一套 API，`ui-plugin-manager/src/client/index.ts:110-146`）。**仍未做的是实测**：外部安装的包能否被客户端模块注册表加载并渲染，需要 M0 实跑一次。文档可信，渲染待验。
2. **v0.1 的配色结论已作废**：三套配色方案在 DSH 上不适用，插件不持有配色权。v0.1 的布局、层级、组件规格仍然有效。
3. **未做浏览器实测**：本文档全部基于仓库内文档与模板的静态阅读，没有实际安装并渲染过插件面板。M0 之后的所有 UI 结论才有实测背书。
