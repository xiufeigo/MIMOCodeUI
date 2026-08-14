# MimoCodeUI

MimoCodeUI 是 [MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code)（小米 MiMo 团队基于 opencode 二开的终端 AI 编码助手）的 **Tauri 2 桌面 GUI 客户端**。

MiMo-Code 自带终端 TUI，但缺少图形界面。MimoCodeUI 直连其无头服务 `mimo serve`，提供会话工作台、流式消息、工具调用、权限审批、计划模式、文件浏览与 PTY 终端。

## 架构

```
┌─────────────── MimoCodeUI（Tauri 2 桌面） ───────────────┐
│ Rust (src-tauri)                                         │
│  └─ serve 管理器：探测/拉起/停止本地 `mimo serve` 子进程   │
│      （spawn --port 0 + 随机 MIMOCODE_SERVER_PASSWORD，   │
│        解析 stdout "listening on" 行获得 URL）            │
│                                                          │
│ WebView 前端（Vite + SolidJS + TS + Tailwind v4）        │
│  ├─ lib/protocol/  手写 v1 协议客户端（REST + SSE）        │
│  ├─ lib/store/     事件驱动 Solid 全局 store（SSE 驱动）   │
│  ├─ routes/        连接页 / 会话工作台 / 文件 / 终端        │
│  └─ components/    消息流、工具卡片、权限/提问、文件树、终端 │
└──────────────────────────────────────────────────────────┘
                 REST + SSE + WS（Basic Auth / 一次性 ticket）
                              ▼
                    mimo serve（sidecar 或外部实例）
```

## 快速开始

前置要求：

- Node.js 20+ 与 Rust 工具链（cargo）
- `mimo` CLI：`npm install -g @mimo-ai/cli`

开发模式：

```bash
npm install
npx tauri dev
```

打包：

```bash
npm run build          # 前端 tsc + vite build
npx tauri build        # 产出 NSIS 安装包
```

## 连接方式

- **本地模式（默认）**：Rust 侧启动 `mimo serve --port 0`，注入每次启动随机生成的
  `MIMOCODE_SERVER_PASSWORD`，前端用 `Authorization: Basic` 连接。
- **外部模式**：连接页手动填写 `http://host:port` 与密码，对接远程 `mimo serve`。

## 协议说明

MiMo-Code 的 `mimo serve` 与上游 opencode **协议不通用**：

- 认证环境变量为 `MIMOCODE_SERVER_PASSWORD` / `MIMOCODE_SERVER_USERNAME`（默认用户 `mimocode`），
  不识别 `OPENCODE_*`。
- 事件流为 v1 命名（`message.part.delta`、`message.part.updated`、`session.status`、
  `permission.asked` 等），**没有** `session.next.*` v2 事件族；SSE 信封 payload 无 `id`。
- 路由挂在根路径（无 `/api` 前缀）：`/session/*`、`/global/event`(SSE)、`/global/health`、
  `/permission/:id/reply`、`/question/:id/reply|reject`、`/pty/*`、`/file`、`/find` 等。
- `POST /session/:id/message` 为长连接（10s 心跳，客户端断连会取消运行），因此发消息
  优先使用 `POST /session/:id/prompt_async`。

> 注：npm 上的 `@mimo-ai/sdk`（0.1.11）发布包不包含 `dist`（broken package），且其 v2
> 事件族与 `mimo serve` 实际事件不匹配，故客户端为手写实现（见 `src/lib/protocol/`）。

## 终端（PTY）协议要点

MiMo 的 PTY WebSocket 与上游 opencode 不同（已对照 0.1.11 源码与实测确认）：

- `POST /pty` 创建；`POST /pty/:id/connect-token` 需带 **`x-mimocode-ticket: 1`** header
  换取一次性 ticket（上游无此要求）。
- WebSocket `/pty/:id/connect?ticket=` 为**裸字节流**：客户端直接发终端输入（字符串/二进制），
  服务端流式回传输出；首个控制帧为 `0x00 + UTF-8 JSON`（如 `{"cursor":n}`），输出无帧包装。
- 尺寸调整走 REST `PATCH /pty/:id`，body `{ size: { cols, rows } }`。

## 文档

- [产品基线](PLAN.md)
- [实施计划](IMPLEMENTATION_PLAN.md)
