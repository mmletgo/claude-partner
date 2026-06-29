# Mobile Workbench Design

- 日期：2026-06-29
- 状态：方案已确认，待转入实现计划

## 1. 背景

Workbench 当前已经支持本机和局域网远端项目、Git worktree、tmux-backed terminal window/pane、文件树、文件浏览/编辑、Git 提交树、Prompt 优化流式写入终端，以及基于 axum 的 `/api/workbench/...` HTTP 网关。桌面端 React 运行在 Tauri WebView 中，主要通过 `invoke()` 调 Rust command，并通过 Tauri event 接收终端输出。

新的目标是：用户在同一局域网内用手机浏览器直接远程访问本机 Workbench，尽量完整使用桌面 Workbench 能力，包括项目、worktree、terminal window/pane、文件浏览编辑、Git 操作和 Prompt 优化。该功能面向用户个人可信局域网，不需要 token、配对码或登录流程；桌面端需要同时展示访问链接和二维码。

用户已确认的方向：

1. 采用独立 `/mobile` 移动端 SPA，不把现有桌面 `/workbench` 改成一个复杂的双形态页面。
2. 移动端默认常开，无 token。
3. 手机竖屏使用顶部展开按钮 + 左侧覆盖式抽屉；宽屏或横屏固定左侧 Rail。
4. 移动端仍复用 PC 端现有 tmux/session/window/pane 机制。
5. Pane 不拆成 React 子面板，由 tmux 在同一个 xterm 画面内渲染。

## 2. 目标

1. 手机浏览器可访问 `http://<局域网IP>:<动态端口>/mobile` 使用 Workbench。
2. 桌面端展示移动访问链接、二维码、复制按钮和当前可访问状态。
3. 移动端复用现有 Workbench HTTP API 和后端业务逻辑，不新增一套移动端后端领域模型。
4. 移动端提供完整 Workbench 功能入口：终端、文件、Git、Worktree、Prompt 优化、项目切换。
5. 终端继续使用现有 tmux-backed session 机制，保持 PC 与手机看到同一套 window/pane 状态。
6. 新增后端 session replay 能力，解决手机首次打开终端时只能看到未来输出的问题。
7. 保留现有文件系统安全边界、baseHash 保存保护、Git/worktree 操作约束和远端项目代理边界。

## 3. 非目标

1. 不做 token、登录、配对码、一次性授权、允许目录白名单或用户权限体系。
2. 不做公网访问、内网穿透、WebRTC 或云端中继。
3. 不把手机端实现为桌面 Workbench 的 CSS-only 响应式变体。
4. 不重新实现 tmux pane 布局或 pane focus 模型。
5. 不做离线编辑、移动端本地缓存项目副本或冲突合并。
6. 不在第一版实现完整 IDE 能力，如 LSP、全局搜索、Git diff 编辑器或 PR 创建。

## 4. 设计原则

1. 双前端，同后端：桌面端继续使用 Tauri invoke/event；移动端使用 HTTP fetch 和 NDJSON event stream。
2. 复用优先：文件能力、Git/worktree、session registry、Prompt 优化和路径安全边界都复用现有后端实现。
3. 小屏重组，不削弱能力：移动端把桌面三栏拆成多个全屏面板，但首期保留完整能力入口。
4. tmux 是唯一 pane 布局源：window 内多个 pane 的分屏、边框、active pane 和 status bar 都由 tmux 渲染到 xterm。
5. 默认常开但表达清楚：不做鉴权，但 UI 需要明确该地址可执行终端输入、文件修改和 Git 操作，仅适合可信局域网。

## 5. 总体架构

### 5.1 前端入口

桌面端保持现状：

- `/workbench` 在 Tauri WebView 中运行。
- API 继续调用 `web/src/api/client.ts` 的 `invoke()`。
- 终端输出继续通过 Tauri `listen('workbench:terminal-output')` 写入现有 buffer store。

移动端新增入口：

- `/mobile` 是一个独立 SPA。
- axum server 服务 `/mobile` 静态资源和 SPA fallback。
- 移动端使用 `fetch('/api/workbench/...')` 调现有 Workbench HTTP 路由。
- 移动端使用 `GET /api/workbench/events` 读取 NDJSON 事件流。

### 5.2 后端入口

axum HTTP server 继续绑定 `0.0.0.0:0` 动态端口。新增：

- `/mobile`
- `/mobile/`
- `/mobile/*`
- `/mobile/assets/*`
- `/api/mobile/access-info`

路由顺序必须保证 `/api/*` 不被 `/mobile` SPA fallback 吃掉。

`/api/mobile/access-info` 返回桌面端展示链接和二维码所需信息：

```json
{
  "deviceName": "Hans MacBook",
  "port": 51842,
  "urls": ["http://192.168.1.23:51842/mobile"]
}
```

URL 必须使用局域网 IP，不能使用 `localhost`，否则手机无法访问。

### 5.3 移动端 API transport

新增 transport 抽象，避免移动端复制大量 API 类型：

- `tauriTransport`：调用现有 `invoke()`，供桌面 Workbench 继续使用。
- `httpTransport`：调用 `/api/workbench/...`，供 `/mobile` 使用。

移动端新增 `workbenchTransport.ts` 定义统一接口，并新增 `workbenchHttp.ts` 集中映射现有 HTTP 路由。映射范围包括：

- projects：list/open/touch/remove；实现阶段必须补本机最近项目 HTTP route，移动端不能依赖 Tauri invoke 读取项目列表。
- worktrees：list/create/get/commit/push/merge/remove。
- sessions：list/create/write/resize/focus/focused/split-pane/close-pane/close/rename。
- files：list-dir/info/open/save-text/format/preview-sqlite/preview-html-asset/create-file/create-dir/rename/delete。
- git：commits。
- prompt-optimizer：stream-to-session。

移动端访问本机时，HTTP route 执行本机 Workbench helper；如果项目本身是 remote shortcut，则继续沿现有 gateway 转发到项目所在远端设备。

## 6. 移动端用户体验

### 6.1 顶层布局

手机竖屏：

1. 顶部栏固定。
2. 左侧为展开按钮。
3. 中间显示当前项目和 active worktree。
4. 右侧显示状态或更多菜单。
5. 主内容区域一次只显示一个功能面板。
6. 点击展开按钮后，左侧抽屉覆盖主内容；点击遮罩或关闭按钮收起。

宽屏或横屏：

1. 功能导航固定为左侧薄 Rail。
2. 主面板占用剩余宽度。
3. 顶部上下文栏仍显示当前项目和 worktree。

抽屉或 Rail 的入口：

- 终端
- 文件
- Git
- Worktree
- Prompt 优化
- 项目切换
- 设置/移动访问说明

### 6.2 项目与 worktree

移动端第一屏进入最近项目或当前项目。项目选择遵循现有 Workbench 项目记录：

- local 项目：在本机执行文件、Git、tmux/PTY、Prompt 优化。
- remote 项目：本机移动端请求先到当前设备，再由现有 remote gateway 转发到项目所在设备。

Worktree 是移动端的全局上下文选择器。切换 worktree 后：

- 终端 window 列表切到该 worktree。
- 文件树根切到该 worktree 根路径。
- Git 状态和提交树切到该 worktree。
- Prompt 优化使用该 worktree cwd。

### 6.3 Terminal window 与 pane

终端层级固定为：

```text
Project → Worktree → Window → Pane
```

移动端显示规则：

1. 手机上一次只显示一个 terminal window。
2. Window 是移动端可切换的一级终端标签。
3. 一个 window 有多个 pane 时，不拆成 React 多面板。
4. 多 pane 画面由 tmux 在同一个 xterm 内渲染。
5. 移动端提供左右分屏、上下分屏、关闭 pane 按钮。
6. pane active 状态由 tmux 画面自身表达。
7. 用户在 tmux 内用快捷键切换 window/pane 时，移动端只需同步 window；pane 状态不额外建模。

PC 和手机同时打开同一个 session 时，它们看到同一套 tmux window/pane 状态。移动端 resize 必须节流，并只在当前 session 可见时发送，避免频繁影响 PC 端画面。

### 6.4 文件面板

文件面板拆成两层：

1. 文件树层：展示 active worktree 根目录，支持展开、刷新、新建、重命名、删除、复制相对路径。
2. 文件工作区层：打开文件后进入编辑/预览页面，支持返回文件树。

文件能力复用现有 Workbench 文件类型矩阵：

- 图片只读预览。
- CSV 只读表格。
- SQLite 只读表/数据预览。
- 代码/文本 CodeMirror 编辑。
- Markdown source/preview/split 或 WYSIWYG。
- HTML source/preview/split。
- JSON/TOML/YAML 格式化和语义校验。

保存继续使用 baseHash 乐观锁。关闭 dirty 文件、删除 dirty 文件路径或切换项目/worktree 时必须确认。

### 6.5 Git 与 Worktree 面板

Git 面板：

- 展示 active worktree clean/dirty/conflict 状态。
- 展示最近提交树和 local/remote/tag ref。
- 提供 Commit、Push、Merge 操作。
- Commit 沿用后端 Claude Code 生成 commit message 的行为。
- Merge 继续监听 merge progress 事件。

Worktree 面板：

- 列出主 worktree 和功能 worktree。
- 支持新建 worktree。
- 支持切换 active worktree。
- 支持删除非主 worktree。

### 6.6 Prompt 优化

移动端不依赖桌面快捷键。Prompt 优化面板提供：

- 原始 Prompt 输入框。
- 目标语言选择，默认沿用设置页配置。
- “写入当前终端”动作。

后端仍调用 `stream_optimize_prompt_to_workbench_session` 对应 HTTP 路由。local 项目在本机 worktree cwd 下运行 Claude CLI；remote 项目继续代理到远端设备，在远端 worktree cwd 下运行。

## 7. 终端事件和 replay

### 7.1 现有问题

桌面端现有 terminal buffer 在前端常驻 Provider 中维护。手机浏览器首次打开时没有这份历史缓存，如果只订阅 `/api/workbench/events`，只能看到连接之后的新输出。

### 7.2 设计

后端为每个 session 维护有限长度输出 ring buffer：

1. PTY reader thread 读取输出。
2. 输出 emit 给 Tauri event。
3. 输出 publish 到 Workbench remote event broadcast channel。
4. 同时追加到后端 session replay buffer。

新增 session replay API，例如：

- `POST /api/workbench/sessions/replay`
  - 入参：`{ sessionId }`
  - 返回：`{ sessionId, buffer, truncated, lastSeq }`

移动端进入 session 时：

1. 请求 replay。
2. 把 replay buffer 写入 xterm。
3. 记录 `lastSeq`。
4. 连接或继续消费 `/api/workbench/events`。
5. 对小于等于 `lastSeq` 的重复 terminal output 事件做去重。

该 replay buffer 不只服务移动端，也可作为后续桌面远端项目、Web 调试或跨浏览器恢复的公共能力。

### 7.3 tmux capture-pane

第一优先是后端统一 ring buffer，因为它同时覆盖 tmux-backed session 和 raw PTY fallback。

tmux-backed session 可以在后续增强中补 `tmux capture-pane`，用于恢复更接近当前屏幕的可见状态。但第一版不依赖 capture-pane，避免引入 pane/window target 差异和 ANSI 还原复杂度。

## 8. 桌面端移动访问入口

桌面端至少在设置页展示移动访问卡片，建议 Workbench 也提供入口。

卡片内容：

- 标题：移动访问。
- 说明：同一局域网设备可直接访问；无鉴权；可执行终端输入、文件修改和 Git 操作。
- 访问链接列表。
- 二维码。
- 复制链接按钮。
- 当前 HTTP 端口和设备名。
- 无法探测局域网 IP 时的错误提示。

二维码由前端根据 URL 生成，不需要后端生成图片。

## 9. 安全与边界

用户确认不需要 token，因此第一版不加鉴权。仍必须保持以下边界：

- `/mobile` 仅描述为个人可信局域网功能，不宣称适合公共网络。
- 文件读写继续限制在 active worktree 根内。
- HTML/Markdown asset 预览继续拒绝外链、data/blob、绝对路径、根外路径和跨根 symlink。
- 文本保存继续使用 baseHash。
- 删除文件、删除目录、删除 worktree、关闭 dirty tab 继续要求确认。
- 远端项目的 HTTP route 必须继续拒绝 remote shortcut 递归代理，确保对端执行的是自己的 local project row。
- 请求回写前必须比对当前 projectId/worktreeId/path/sessionId，旧响应不能污染新 UI。

## 10. 实施阶段

### 10.1 后端移动入口

- `/api/mobile/access-info`
- `/mobile` 静态资源服务和 SPA fallback。
- Workbench session replay/ring buffer。
- 补本机最近项目 HTTP route。

### 10.2 移动端基础壳

- 独立 `/mobile` SPA。
- 顶部栏 + 可收起抽屉/宽屏固定 Rail。
- HTTP transport。
- NDJSON event hook。
- 最近项目、项目打开、worktree 切换。

### 10.3 完整 Workbench 面板

- 终端 window/pane 操作，复用 tmux。
- 文件树 + 文件编辑/预览/保存。
- Git 提交树 + Commit/Push/Merge。
- Prompt 优化写入当前终端。

### 10.4 桌面入口和二维码

- 设置页/Workbench 展示访问链接和二维码。
- 复制链接。
- 无鉴权局域网风险说明。

## 11. 验证策略

Rust 侧：

- access-info URL 生成测试。
- `/mobile` fallback 不吞 `/api/*` 的 route 测试。
- session replay buffer 追加、截断、lastSeq 和重复事件去重测试。
- 相关现有验证优先跑：
  - `cd src-tauri && cargo test net::routes::workbench --lib`
  - `cd src-tauri && cargo test workbench::sessions --lib`
  - `cd src-tauri && cargo check`

前端侧：

- HTTP transport 参数映射测试。
- NDJSON event 解析与重连测试。
- 移动导航布局 helper 测试。
- Worktree/window/pane 状态映射测试。
- 文件 tab reducer、baseHash 冲突、dirty 关闭确认测试。
- Prompt 优化 payload 测试。
- 相关构建验证：
  - `cd web && npm run build`
  - 新增 mobile 单测使用 `npx --yes tsx ...`

手动端到端：

1. 桌面端显示移动访问 URL 和二维码。
2. 手机或浏览器打开 `/mobile`。
3. 选择项目和 worktree。
4. 创建 terminal window。
5. 输入命令并看到输出。
6. 创建左右/上下 pane，确认 tmux 在 xterm 内渲染。
7. 打开、编辑、保存文件。
8. 查看 Git 状态并执行 Commit/Push/Merge。
9. Prompt 优化写入当前终端。

## 12. 文档更新

实现时需要同步更新：

- 根 `AGENTS.md`：补移动端远程访问 Workbench 的项目概览和目录地图。
- `web/CLAUDE.md`：补 `/mobile` SPA、HTTP transport、移动端验证命令。
- `src-tauri/CLAUDE.md`：补 `/mobile` 静态入口、access-info、session replay/ring buffer、复用 tmux 机制。
- `docs/prd.md`：补局域网移动端远程访问工作台的需求描述。

这些更新属于实现阶段的一部分；本设计文档只锁定方案，不作为变更日志。
