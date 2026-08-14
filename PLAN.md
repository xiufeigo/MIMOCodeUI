# MiMoCodeUI 产品基线

- 版本：0.1.0
- 状态：M1-M4 主链路已实现，真实 mimo serve 冒烟 + 浏览器端到端 GUI 验证通过
  （见 IMPLEMENTATION_PLAN.md 验证记录）

## 1. 目标

MiMo-Code 是终端原生 AI 编码助手，官方只有 TUI，缺少图形界面。MiMoCodeUI 提供桌面 GUI：

- **会话工作台**：会话列表、新建会话、历史消息恢复、流式消息渲染。
- **工具可见性**：agent 的工具调用（shell/read/edit/write/glob/grep/webfetch/websearch/task 等）以卡片呈现，输出可折叠。
- **审批**：权限请求（once/always/reject）与提问弹窗直接在 GUI 中处理。
- **计划模式**：plan_enter / plan_exit 工具 part 可见并可响应计划完成提问。
- **文件与终端**：工作区文件树浏览、文件只读查看；PTY 终端（WebSocket + 一次性 ticket）。
- **模型/Agent**：会话内 agent 与模型切换（后续里程碑）。

## 2. 非目标

- 不实现代码编辑/保存（只读查看）。
- 不实现 opencode 官方桌面 App 的全套功能（分享、插件市场等）。

> 注：桌面安装包会捆绑 Windows 版 `mimo.exe`（`src-tauri/resources/`，
> 由 `scripts/prepare-mimo.mjs` 从全局 npm 包 `@mimo-ai/mimocode-windows-x64` 复制，
> MIT 许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)）。

## 3. 技术约束

- 后端固定为 `mimo serve`（MiMo-Code，`@mimo-ai/cli`）。
- 客户端直连：REST + SSE + WebSocket，Basic Auth（`mimocode` + 密码）。
- 前端 SolidJS + Tailwind v4；壳 Tauri 2（Windows NSIS 目标）。
- 每次启动本地 serve 使用随机密码，不持久化凭据。

## 4. 安全边界

- 本地 serve 只监听 127.0.0.1；密码仅存在于启动环境与前端内存。
- 外部连接需用户显式提供 URL 与密码。
- PTY WebSocket 使用一次性 ticket，避免在 WS 升级中传递凭据。
