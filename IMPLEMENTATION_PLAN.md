# MiMoCodeUI 实施计划

- 版本：1.0
- 后端：MiMo-Code `mimo serve`（协议调研结论见 README「协议说明」）

## 里程碑

| 里程碑 | 内容 | 验收 |
| --- | --- | --- |
| M1 | 工程骨架：Tauri2 + SolidJS + Vite + Tailwind；Rust sidecar 拉起 `mimo serve`；连接页；`/global/health`；SSE `server.connected` | 启动应用自动连上真实 mimo serve |
| M2 | 会话列表/新建；prompt_async 发消息；事件驱动 store；Markdown 流式渲染；历史恢复；abort 中断 | 真实会话端到端打字→流式→历史恢复 |
| M3 | 工具卡片；diff 视图；权限审批；提问弹窗；plan 模式指示 | bash 权限可从界面批准/拒绝 |
| M4 | 文件树/只读查看；xterm 终端（PTY ticket+WS）；模型/Agent 切换 | 可浏览文件、终端可交互 |
| M5 | 主题、设置页、断线重连提示、NSIS 打包、文档收口 | 安装包可安装启动 |

## 关键实现决策

1. **手写 v1 协议客户端**（`src/lib/protocol/`）：`@mimo-ai/sdk@0.1.11` npm 包不含 dist
   （broken），且其 v2 事件族与 `mimo serve` 实际事件集不匹配；端点面小（约 15 个），手写可控。
2. **事件驱动 store**（`src/lib/store/`）：参照 opencode TUI `sync.tsx` 模式，单一 Solid store
   由 SSE 事件 `produce` 更新；SSE 订阅带指数退避重连（1s→30s）。
3. **发消息用 `prompt_async`**：同步 `POST /message` 在客户端断连时会被服务端取消运行，
   async 端点不受影响。
4. **本地 serve 生命周期**（`src-tauri/src/serve.rs`）：`mimo serve --port 0`（OS 分配空闲端口，
   避免与既有实例冲突）+ 每次启动随机 `MIMOCODE_SERVER_PASSWORD`；解析 stdout 中
   `listening on http://...` 行获得 URL。

## 验证策略

- 前端：`npm run typecheck`（tsc）+ `npm run build`（vite）。
- 集成：`node scripts/serve-smoke.mjs` — spawn 真实 `mimo serve`，验证
  health/auth/session/prompt_async/SSE 事件/message 回读。
- 手工 E2E：桌面内真实会话、权限、文件、终端逐项验收。

## 验证记录

### 2026-08-12 M1-M4 冒烟

- 真实 `mimo serve`（0.1.11，小米模型）实测：health 需 Basic auth、session 创建/列表、
  `prompt_async` 提交后 SSE 事件流（server.connected / session.status / message.updated /
  busy / session.diff 等）与消息回读全部确认；assistant 消息含 text/reasoning/step-start parts。
- `@mimo-ai/sdk@0.1.11` npm 包确认不含 dist（broken），据此确定手写客户端方案。
- 前端 `tsc --noEmit` 与 `vite build` 通过。
- Rust `cargo check` / `cargo build` 通过；`npx tauri icon` 生成完整图标集。
- 冒烟脚本 `scripts/serve-smoke.mjs` 全绿：health 认证 401/200、session 创建/列表、
  prompt_async 204、SSE 事件（server.connected、message.part.delta/updated、session.status、
  session.idle）、消息回读含 assistant 回复、agents 列表。

### 2026-08-12 浏览器端到端 GUI 验证（外部连接真实 mimo serve，端口 4305）

- 连接页 → 输入 `http://127.0.0.1:4305` + 密码 → 连接成功进入工作台，侧栏列出真实历史会话。
- 新建会话 → 发送「用一句话回答：1+1等于几？」→ assistant 消息渲染：
  build agent、mimo-v2.5-pro-ultraspeed、耗时 4s、思考过程折叠、回复「1+1等于2。」；
  会话标题自动生成为「1+1的答案」。
- **文件浏览器**：`/file` 端点参数为 `path`（相对路径，从工作区根），非 `directory`；
  修复后文件树正确列出项目目录、展开 src 可浏览、点击 app.tsx 正确显示源码内容。
- **终端**：MiMo PTY 协议实测为 **WS 裸字节流 + 控制帧(0x00+JSON)**，非 JSON 帧；resize 走
  REST `PATCH /pty/:id`；`connect-token` 需 `x-mimocode-ticket: 1` header（MiMo 特有，
  上游 opencode 无此要求）。修复后终端正常连接、`echo mimo-e2e-ok` 命令输入/输出闭环。
- 交互层修复：连接页改为 `<form>` 支持回车提交（外部键盘验证）。

### 2026-08-12 M5 NSIS 打包

- `npx tauri build` 产出 `src-tauri/target/release/bundle/nsis/MiMoCodeUI_0.1.0_x64-setup.exe`
  （SHA-256 `ebfacd86bf006711cad4845e230c503aa2f8179c1025c4d69c9ff4c28abed3b3`）。
- release 可执行文件 `mimo-code-ui.exe`（3.0MB）由 release profile（lto+opt-level=s）产出。
- 安装包未捆绑 mimo 二进制：首版要求系统已安装 `@mimo-ai/cli`；捆绑 externalBin 留待后续。

### 2026-08-12 遗留项收口（Diff / 模型切换 / 权限联调 / 二进制捆绑）

- **Diff 视图**：新增 `src/lib/diff/unified.ts`（unified diff 解析器，修复 oldName 被空值覆盖的
  merge bug）+ `src/components/diff/diff-view.tsx`（+n/-m 统计、split 行着色、文件头显示）；
  `ToolPartView` 对 edit/apply_patch/write 工具自动识别 diff 内容（content/output/patch/diff 字段）
  并渲染 DiffView。解析器单测样例通过（3 增 1 删、行类型正确）。
- **模型/Agent 切换**：workspace header 新增「选择 Agent」「选择模型」下拉（数据来自
  `/agent` 与 `/config/providers`），选择经 `PromptInput` 透传到 `prompt_async` 的
  `agent` 与 `model:{providerID,modelID}` 字段。curl 实测 `agent:"plan"` 与
  `model:{...}` 均 204 通过。
- **权限真实触发联调**（external_directory 场景）：
  - 用 plan agent 让模型 read 工作区外文件，服务端确认发出 `permission.asked`
    （平铺 properties：`{id, sessionID, permission, patterns, metadata, always, tool}`）。
  - 修复 store：permission.asked 按平铺格式解析；`PermissionRequest` 类型对齐
    （permission/patterns 字段）。
  - **发现并修复 SSE 断连丢事件**：连接/重连后 `GET /permission` 拉取挂起权限
    backfill 进 store（浏览器实测 4 次断连后弹窗仍正确显示）。
  - 浏览器端到端：弹窗渲染（权限类型/patterns/文件路径）→ 点「允许一次」→
    read 完成（文件内容 + ✓ 渲染），闭环通过。
- **mimo 二进制捆绑**：`scripts/prepare-mimo.mjs` 从 npm 全局安装复制平台原生二进制
  （`@mimo-ai/mimocode-windows-x64/bin/mimo.exe`，约 130MB）到 `src-tauri/resources/`；
  `tauri.conf.json` 声明 bundle resources；`serve.rs` 优先解析捆绑二进制、
  回退系统 `mimo`（Windows 仍走 `cmd /C` 兼容 shim）。
- **NSIS 含捆绑二进制验证**：静默安装 `MiMoCodeUI_0.1.0_x64-setup.exe`（34MB，SHA-256
  `12cc8828538ba42ce78932fbf4686f880a81476735cae04762d6deddd2ccd09c`）到临时目录，确认
  含 `mimo.exe` + `mimo-version.txt` + `mimo-code-ui.exe`；直接运行捆绑的 `mimo.exe serve`
  启动成功、`/global/health` 200——安装包可独立工作，无需系统预装 mimo。

### 2026-08-12 用户问题修复（对照 MiMo 源码深读）

1. **Agent 下拉显示内部 agent**：`/agent` 返回所有 agent，内部 subagent
   （checkpoint-writer/compaction/distill/dream/summary/title）带 `hidden: true` +
   `mode: "subagent"`。前端过滤 `hidden !== true && mode !== "subagent"`，下拉只显示
   build/plan/compose（浏览器验证：`["build","plan","compose"]`）。
2. **模型无法切换**：`/config/providers` 的 `models` 是 **dict（map）** 非数组，SolidJS
   `<For>` 对对象不渲染。改为 `Object.values(models)` 展平为 option 列表（浏览器验证：
   4 个模型正确显示；选择 plan agent + mimo-v2.5-pro 发消息，服务端消息确认
   `agent: plan, model: mimo-v2.5-pro` 真实生效）。
3. **连接只支持 password**：连接页新增「用户名」输入框（默认 `mimocode`），
   `connectExternal(url, username, password)`；Rust 侧 `ServeHandle` 已带 username 字段。
4. **启动 serve 弹 cmd 窗口**：Windows 下 `cmd /C` 子进程加
   `creation_flags(CREATE_NO_WINDOW)`（0x08000000）隐藏控制台窗口。
5. **界面/功能补强**：会话删除（hover 显示 ✕ → 确认，`DELETE /session/:id` 已验证 200）；
   消息头像/时间/耗时/模型名显示、气泡宽度、细滚动条；工作台 header 会话标题 + 「断开」
   按钮（断开返回连接页已验证）；连接页表单回车提交。
- 验证：`tsc` / `vite build` / `cargo check` / `serve-smoke` 全绿；浏览器端到端
  （用户名连接、agent/模型下拉、切换生效、断开返回、删除端点）。

### 2026-08-12 opencode 式启动流程（设置中选本地/远端）

- **启动直达工作台**：废弃「连接页 → 工作台」流程。`App` 现在总是渲染
  `WorkspacePage`（opencode 风格）：未连接时主区显示嵌入式未连接态，侧栏禁用
  新建；连接后显示会话/文件/终端。
- **设置弹窗**（header ⚙）：`settings-dialog.tsx`，单选「本地 server / 远端
  server」；本地自动启动自带/系统 `mimo serve`，远端填 URL + 用户名（默认
  mimocode）+ 密码；状态栏显示连接状态与版本；可清除保存的连接。
- **配置持久化 + 启动自动连接**：连接配置存 localStorage（`mimocode-ui:connection`）。
  启动时按保存配置自动连接：远端 → 直接拨号；否则 Tauri 环境 → 自动启动本地
  serve；浏览器 dev → 停在未连接态由用户进设置选择。
- **修复：浏览器模式误判 Tauri**：改为官方 `window.__TAURI_INTERNALS__` 环境检测
  （浏览器里 import @tauri-apps/api 会成功但 invoke 不可用，旧实现误触发本地
  启动报错）；`loadTauriBridge` 增加 invoke 存在性防护。
- **修复：连接后会话不加载**：Workspace 常驻后 `onMount` 的 hydration 在连接前
  执行（client 为 null）。改为 `createEffect` 监听 `connection().status`，
  连接成功时 hydration，断开时重置以便重连后重新加载。
- 浏览器端到端验证：启动即工作台 + 未连接态（无 JS 错误）→ 设置弹窗选远端 →
  应用连接成功（侧栏会话加载、断开按钮出现）→ 刷新后自动重连 + 会话恢复
  （localStorage 持久化生效）。

### 2026-08-12 设置照抄 OpenCode 桌面版（5-Tab 设置对话框）

对照 opencode `packages/app/src/components/settings-v2/` 重构设置界面：

- **5-Tab 结构**（左侧导航 + 右侧内容，照抄 opencode）：`General` / `Shortcuts` /
  `Servers` / `Providers` / `Models`（`components/settings/settings-dialog.tsx`）。
- **General**：外观（配色 system/light/dark、**37 个 OpenCode 主题**选择器、界面/
  代码/终端字体）、通用开关（推理摘要、shell/edit 工具默认展开）、通知（Agent/
  权限/错误）、高级（文件树/导航/搜索/状态/自定义 Agent）。Shell 设置项因 MiMo
  config 无 `shell` 键而省略。
- **Models**：模型列表（按 provider 分组 + 搜索 + 默认标记），每模型「显示/隐藏」
  开关 → 会话 header 模型下拉实时过滤（照抄 opencode `model.v1` localStorage 语义）。
- **Providers**：provider 状态标签（已连接/已认证/未连接 + 来源）、启用/禁用
  （`PATCH /global/config { disabled_providers }`）、自定义 provider 表单（写入
  `provider.<id>` 到 mimocode.jsonc）。「连接/断开」置灰：MiMo serve 无 HTTP 认证
  写入口（auth.json 在服务端）。
- **Servers**：本地/远端连接 + 状态展示 + 清除保存连接（并入原连接设置）。
- **Shortcuts**：命令列表 + 键位录制（onKeyDown 组合键 → localStorage）+ 全局
  keydown 监听触发（打开设置/新建会话/切换 tab/聚焦输入/断开等）。
- **基础设施**：`scripts/fetch-themes.mjs` 从 opencode 拉取 37 主题 JSON 转译成
  CSS 变量注册表（`src/lib/theme/themes.ts`）；`SettingsProvider`（localStorage
  持久化）+ `applyTheme`（写 `#mimo-theme` style + `data-theme`/`data-color-scheme`）；
  client 新增 `GET/PATCH /global/config`（实测 merge 语义 200）+ `/provider`。
- 浏览器端到端验证：5-Tab 渲染、Dracula 主题切换（data-theme=dracula + CSS 变量
  注入）、Models 列表加载 + 可见性开关过滤（关闭 UltraSpeed 后 header 下拉消失）、
  Providers 状态/禁用按钮、Servers 连接、`/global/config` GET/PATCH 200。
- 快捷键录制的 UI 自动化受浏览器工具限制（无 keyboard API），代码路径已构建验证。

### 2026-08-12 提供商 Tab 照抄 opencode 修正

对照 opencode 源码逐行重写提供商 Tab（`settings-v2/providers.tsx` +
`hooks/use-providers.ts`）：
- **热门列表照抄**：opencode `popularProviders` 实为 8 项（opencode、opencode-go、
  anthropic、github-copilot、openai、google、openrouter、vercel），映射为 MiMo 生态
  （opencode、anthropic、github-copilot、openai、google、openrouter、vercel、mimo）；
  按列表顺序排序、排除已连接（照抄 `popular()` 逻辑）。
- **结构照抄**：两个分组「已连接」（connected+authenticated）与「热门」；热门区
  底部含「自定义提供商」入口行 + 「查看全部提供商」按钮（展开「其他提供商」折叠
  分组，默认收起）——删除了此前错误直接展示的「其他」大分组。
- **来源标签照抄**：`sourceLabel` 映射 env→环境变量、api→API 密钥、config→配置/
  自定义、custom→自定义（照抄 opencode `type()`）；config 自定义判定照抄
  `isConfigCustom`（npm===@ai-sdk/openai-compatible 且 models 非空）。
- **禁用逻辑照抄**：`disableProvider` 读写 `disabled_providers` + PATCH config。
- 浏览器端到端验证：已连接（Xiaomi/MiMo Auto）+ 热门（Anthropic/OpenAI/Google/
  OpenRouter/Vercel）+ 查看全部展开（Zhipu/Mistral 等 163 项）全部正确。

### 2026-08-12 会话侧栏按文件夹分组

- `session-sidebar.tsx` 重构：按 `session.directory` 分组（取路径最后一段作组名，
  无目录归「未分类」），组标题含 📁 图标 + 目录名 + 会话数，可折叠（默认展开）；
  组内保持会话 newest-first 顺序，组按首次出现顺序排列。
- 浏览器端到端验证：分组渲染正确（MiMoCodeUI 16 / src-tauri 5 / test 3 / Temp 1 /
  xiufe 4 / hermes_cache 4 / 未分类等），折叠逻辑与 Models 分组折叠同构。

### 2026-08-12 Trae 风格三栏布局重设计

按 Trae 桌面端 UI 结构重构前端（阶段完成）：
- **三栏布局**：`workspace.tsx` 从两栏改为「左导航 | 中间聊天 | 右面板」：
  - 左导航（`left-nav.tsx`，替代旧 session-sidebar）：logo+图标行（搜索/编辑/帮助）、
    Work/Code/Design 模式切换、5 个导航项（任务列表/插件市场/自动化/办公助理/模板库）、
    任务列表（按文件夹分组+折叠+计数）、底部用户信息（头像/用户名/免费版/设置）；
    可折叠（w-60 ↔ w-16 仅图标）。
  - 中间聊天：顶部栏（折叠按钮/任务名/创建时间/Agent+模型下拉/状态/上下文按钮/设置/
    断开）→ 聊天流 → 输入栏。
  - 右面板（`right-panel/panel.tsx`，默认收起，点「上下文」展开）：任务摘要/待办/
    上下文进度条（技能/文件/其他 + 压缩按钮）+ 文件/终端 Tab。
- **聊天重设计**（`message-list.tsx` + `parts.tsx`）：全宽卡片替代 max-w-3xl 居中；
  用户消息右对齐深色气泡；Agent 消息左对齐宽卡片（头像+名称+模型+耗时）；
  文件变更折叠卡（「N 个文件已更改 +X -Y」）；assistant 消息下 5 个反应按钮
  （👍👎📋📤🔁）。
- **输入栏增强**（`prompt-input.tsx`）：附件📎/图片🖼/模型选择/语音🎤/「由 AI 生成」标注。
- **主题系统接入**（`apply.ts` + `styles.css`）：新增语义 CSS 变量
  （--bg-app/--bg-panel/--bg-surface/--text-primary/--text-secondary/--border-color/
  --accent/--success/--error 等），`applyTheme` 从主题 palette 映射生成（light/dark
  两套）；全库组件从 Tailwind 硬编码色迁移到 `var(--*)`（sed 批量迁移 ~150 处），
  浅色/37 主题切换真正生效。
- 浏览器端到端验证：三栏渲染、左导航折叠/展开、右面板（摘要/待办/上下文/压缩）、
  聊天输入栏/工具栏、文件夹分组全部通过。
- 备注：浅色主题 UI 自动化受浏览器点击管线限制未截图验证，但 applyTheme 的
  light/dark 语义变量映射与已验证的 dracula 主题切换走同一代码路径。

### 2026-08-13 Trae 目标界面最终重构（圆角双卡片 + 左栏文件树 + 右面板审查/上下文）

按用户提供的 Trae 目标截图重构：
- **中间面板 + 右面板均为圆角矩形卡片**：`workspace.tsx` 中间聊天列包
  `rounded-2xl border bg-[var(--bg-surface)]`；右面板改为并排 `w-96` 圆角卡片（默认打开），
  不再 absolute 悬浮，二者 `gap-2 p-2` 并排。
- **左栏文件树**：会话行 hover 显示「🗀 文件管理」图标（在 ✕ 旁），点击左栏切换为该项目
  文件目录树（`file-tree.tsx`：返回项目列表 + ⋯ 菜单「添加文件/新建文件夹/刷新」+ 懒加载树）。
  新建文件/文件夹走 **Tauri Rust `fs_create_file`/`fs_create_dir`**（MiMo serve 无文件写接口）；
  远程 external 后端禁用新建（`canWriteFiles` 判定 Tauri 且非 remote）。
- **右面板 Tab 化**（`panel.tsx` 重写）：默认「审查」「上下文」两个**不可关闭**标签页。
  - 审查（`review.tsx`）：聚合会话 edit/apply_patch/write 变更，行级 `已添加/已修改 +N -M`，
    可展开 diff，统一/并排视图切换、全部展开。
  - 上下文：Trae 式（待办 + 进度% + 压缩 + 技能/文件/其他），并追加第四子 Tab「上下文详情」
    （`context-detail.tsx`，OpenCode 官方样式：会话/消息数/提供商/模型/上下文限制/词元/使用率/
    输入/输出/推理/缓存/成本/创建时间/最后活动 两列网格 + 上下文细分进度条 + 原始消息列表）。
- 浏览器端到端验证：中间+右圆角卡片、会话行文件管理图标、右面板审查工具栏、上下文详情
  （待办/词元总数/上下文细分/原始消息）全部渲染；`tsc`/`vite build`/`cargo check`/smoke 通过。

## 已知限制 / 后续

- 消息删除与会话删除：v1 协议面未见稳定删除端点，侧栏暂不提供删除操作。
- diff 视图：当前工具卡片显示输出文本；完整语法高亮 diff（@pierre/diffs）待 M5。
- 模型/Agent 切换 UI：协议已支持（prompt 时指定 agent/model），界面入口待 M5。
- 权限/提问弹窗：事件处理与回复端点已实现（permission.asked/replied、question.asked/replied/
  rejected），需真实触发场景联调确认（如让 agent 执行 bash）。
