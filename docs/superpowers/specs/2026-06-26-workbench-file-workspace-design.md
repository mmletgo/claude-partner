# Workbench File Workspace Design

## 背景

Workbench 现有能力已经覆盖项目文件夹树、路径元信息、创建文件/文件夹、重命名、删除、复制相对路径和 Git 历史。`docs/prd.md` 目前明确写着第一期不做文件内容预览、图片预览、代码高亮和 Markdown 渲染。本设计推进下一阶段能力：用户在工作台中选中项目文件夹里的图片、Markdown、代码、CSV、SQLite DB、JSON、TOML 等文件后，可以在 Workbench 内浏览和编辑，而不需要跳出应用。

用户已确认的方向是 **B1 文件标签页工作区**：不永久改变当前 Workbench 主结构，但在打开文件时允许中央终端区域临时切换为文件工作区；终端可以不可见，但 terminal window/pane 会话必须保留，返回终端时不重建、不 replay、不丢上下文。

## 目标

1. 在 Workbench 中增加中央文件标签页工作区，支持同时打开多个文件。
2. 保留现有项目侧栏、顶部 worktree/window 管理层、右侧检查器和文件树职责。
3. 支持以下文件类型的浏览：
   - 图片：PNG、JPEG、GIF、WebP、SVG。
   - Markdown：所见即所得、源码、拆分视图。
   - 代码/文本：语法高亮编辑。
   - JSON/TOML：语法高亮、格式化、语义校验。
   - CSV：结构化表格只读预览。
   - SQLite：schema/table 只读浏览。
4. 支持以下文件类型的编辑保存：
   - Markdown。
   - 代码/普通 UTF-8 文本。
   - JSON。
   - TOML。
5. JSON/TOML 必须提供格式化按钮，保存前必须通过语义校验；前端即时校验，后端保存前再次校验。
6. Markdown 采用 Typora 式体验：预览模式下也可以直接编辑；保存时允许 Markdown 被规范化。
7. 文件读写必须继续沿用 Workbench active worktree 根路径安全边界，避免越界、外部 symlink、外部修改覆盖和大文件卡死。

## 非目标

1. 第一版不做 CSV 单元格编辑，也不做 CSV 原文编辑。
2. 第一版不做 SQLite 写入、SQL 执行、事务保存或行编辑。
3. 第一版不做 Git diff 面板或交互式冲突解决。
4. 第一版不做远端 cc-partner 项目的原生远端文件内容浏览；仍只覆盖本机目录或已挂载目录。
5. 第一版不追求完整 IDE 语言服务，不做 LSP、跳转定义、重命名符号或项目级搜索。

## 用户体验

### 文件工作区入口

右侧检查器中的文件树仍绑定 active worktree 根目录。用户点击文件时：

1. 前端获取路径元信息。
2. 根据文件类型打开或聚焦中央文件 tab。
3. 中央区域从终端视图切换到文件工作区。
4. 顶部 terminal window tabs 仍存在，但当前可见区域是文件 tab；用户点击“返回终端”或 terminal tab 后恢复终端。

目录点击仍只负责展开/收起和展示 metadata，不打开文件 tab。

### 文件标签页

中央文件工作区支持多个文件 tab。每个 tab 记录：

- `path`
- `name`
- `detectedType`
- `mode`
- `dirty`
- `baseHash`
- `baseModifiedAt`
- `content`
- `preview`
- `error`
- `loading`

关闭 dirty tab 时必须确认；切换项目或 worktree 时，如果存在 dirty 文件 tab，也必须阻止静默丢失。

### 右侧检查器职责

右侧检查器不升级成编辑器，继续负责：

- 文件树。
- 路径元信息。
- 新建文件/文件夹。
- 重命名。
- 删除。
- 复制相对路径。
- Git 历史 tab。

文件内容和编辑行为全部在中央文件工作区完成。

## 文件类型能力矩阵

| 文件类型 | 第一版浏览 | 第一版编辑 | 说明 |
| --- | --- | --- | --- |
| 图片 | 专用图片查看器 | 不编辑 | 支持适配窗口、缩放、真实尺寸信息、复制路径 |
| Markdown | WYSIWYG / 源码 / 拆分 | 可编辑 | WYSIWYG 类 Typora，保存时允许 Markdown 规范化 |
| 代码 | CodeMirror 高亮编辑 | 可编辑 | 行号、搜索、折叠、括号匹配、多语言高亮 |
| 普通 UTF-8 文本 | CodeMirror/plain text | 可编辑 | 无法识别语言时按普通文本打开 |
| JSON | CodeMirror + 格式化 + 语义校验 | 可编辑 | 保存前必须 parse 通过；格式化输出标准缩进 |
| TOML | CodeMirror + 格式化 + 语义校验 | 可编辑 | 保存前必须 parse 通过；格式化输出规范 TOML |
| CSV | 表格只读预览 | 不编辑 | 支持 header、行列预览、截断提示 |
| SQLite DB | schema/table 只读浏览 | 不编辑 | 支持表列表、字段、前 N 行预览 |
| 其他二进制 | 元信息提示 | 不编辑 | 不读取正文，不塞入 IPC |
| 超大文件 | 元信息提示 | 不编辑 | 提示超过打开限制 |

## 编辑器栈

### CodeMirror 6

CodeMirror 6 用于：

- 代码文件。
- 普通文本文件。
- JSON。
- TOML。
- Markdown 源码模式。

第一版能力：

- 行号。
- 搜索。
- 折叠。
- 括号匹配。
- 当前行高亮。
- 基础多语言语法高亮。
- JSON/TOML 诊断提示。

语言支持按文件扩展名加载。首批优先覆盖 TypeScript/JavaScript/TSX/JSX、Rust、Python、Markdown、JSON、TOML、CSS、HTML、Shell。未覆盖语言回退 plain text。

### Tiptap / ProseMirror

Tiptap 用于 Markdown 的 WYSIWYG 模式。用户确认选择“允许 Markdown 保存时规范化”，因此 Tiptap 是 Markdown 富文本编辑的主体验。保存时通过 Markdown serializer 输出 Markdown 文本，允许出现以下变化：

- 空行规范化。
- 列表缩进规范化。
- 等价 Markdown 标记改写。
- 部分 HTML/Markdown 混排内容被转换为 Tiptap 支持的结构。

Markdown tab 提供三种模式：

1. `wysiwyg`：Typora 式编辑，正文直接可改。
2. `source`：CodeMirror 源码编辑。
3. `split`：左侧 WYSIWYG，右侧源码预览/编辑。

模式切换必须同步同一份 Markdown 内容。同步失败时保留当前模式内容并显示错误，不自动覆盖。

## 前端架构

新增或修改文件建议：

- `web/src/pages/Workbench/Workbench.tsx`
  - 接入文件工作区状态。
  - 文件树点击文件后调用打开 tab。
  - 中央区域在 terminal workspace 与 file workspace 之间切换。
- `web/src/pages/Workbench/Workbench.module.css`
  - 增加文件 tab、编辑器容器、预览器布局样式。
- `web/src/pages/Workbench/workbenchFiles.ts`
  - 文件类型识别。
  - 可编辑/可预览能力判断。
  - tab reducer/helper。
  - JSON/TOML 前端校验入口。
- `web/src/components/domain/WorkbenchFileWorkspace/`
  - 文件 tab 容器。
  - dirty 状态和关闭确认。
  - “返回终端”入口。
- `web/src/components/domain/WorkbenchCodeEditor/`
  - CodeMirror 封装。
  - 主题同步 `cp-theme-change`。
  - onChange/dirty 回写。
- `web/src/components/domain/WorkbenchMarkdownEditor/`
  - Tiptap + CodeMirror 模式切换。
  - Markdown serializer/parser 错误展示。
- `web/src/components/domain/WorkbenchImagePreview/`
  - 图片预览和缩放。
- `web/src/components/domain/WorkbenchCsvPreview/`
  - CSV 表格只读预览。
- `web/src/components/domain/WorkbenchSqlitePreview/`
  - SQLite 表/字段/前 N 行预览。
- `web/src/api/workbench.ts`
  - 增加 files content/preview/save API 封装。
- `web/src/lib/types.ts`
  - 增加文件内容、预览、保存 DTO。
- `web/src/i18n/locales/{zh,en}/workbench.json`
  - 增加文件工作区文案。
- `web/CLAUDE.md`
  - 增加 Workbench 文件工作区约定和测试命令。

### Hooks 顺序

所有新增 React 组件必须遵守项目规则：`useState`、`useMemo`、`useCallback`、`useEffect` 等 hooks 必须放在任何 early return 之前，避免 React error #310。

### 状态隔离

文件内容请求必须沿用当前 Workbench 的异步防串台模式：

- 请求发起时记录 `projectId`、`worktreeId`、`path`。
- 请求返回时比对当前 `activeProjectIdRef` 与 `activeWorktreeIdRef`。
- 不匹配时丢弃结果。

项目/worktree 切换时：

- 清空非当前 worktree 的 file tabs，或按 worktree 分组缓存后隐藏。
- 第一版建议清空并要求保存 dirty tab 后再切换，降低复杂度。

## 后端架构

现有 `src-tauri/src/workbench/fs.rs` 已经提供安全文件树和 CRUD 边界。新增能力继续复用：

- `canonical_root`
- `resolve_existing_leaf`
- `resolve_new_child`
- `reject_external_symlink`
- `validate_child_name`
- commands 层的 `get_project`
- commands 层的 `resolve_worktree`
- commands 层的 `run_blocking_fs`

新增或修改文件建议：

- `src-tauri/src/workbench/file_content.rs`
  - 文本读取。
  - 文本保存。
  - UTF-8/BOM 处理。
  - hash/modifiedAt 计算。
  - JSON/TOML 校验与格式化。
- `src-tauri/src/workbench/file_preview.rs`
  - 图片 metadata。
  - CSV 只读预览。
  - 文件类型识别。
- `src-tauri/src/workbench/sqlite_preview.rs`
  - SQLite 只读连接。
  - schema/table/columns/rows 读取。
- `src-tauri/src/workbench/models.rs`
  - 增加 DTO。
- `src-tauri/src/commands/workbench.rs`
  - 增加薄命令封装。
- `src-tauri/src/lib.rs`
  - 注册新命令。
- `src-tauri/CLAUDE.md`
  - 记录文件工作区后端安全约定和验证命令。
- `docs/prd.md`
  - 修改 Workbench 第一阶段“不做文件预览”描述，记录新阶段能力。

## 后端命令契约

### open_workbench_file

输入：

- `projectId: String`
- `worktreeId: Option<String>`
- `path: String`

输出：

- `metadata: WorkbenchPathInfo`
- `detectedType: WorkbenchDetectedFileType`
- `capabilities: WorkbenchFileCapabilities`
- `content: Option<WorkbenchTextContent>`
- `preview: Option<WorkbenchFilePreview>`
- `baseHash: Option<String>`
- `baseModifiedAt: Option<String>`
- `truncated: bool`
- `notice: Option<String>`

行为：

- 仅文件可打开。
- 文本类在大小限制内返回 UTF-8 content。
- 图片返回预览 metadata 和 data URL 或安全资源引用。
- CSV 返回前 N 行只读表格。
- SQLite 返回表列表和默认表的前 N 行。
- 不支持或超限文件只返回 metadata/capabilities/notice。

### save_workbench_text_file

输入：

- `projectId: String`
- `worktreeId: Option<String>`
- `path: String`
- `content: String`
- `baseHash: String`
- `baseModifiedAt: Option<String>`
- `detectedType: WorkbenchDetectedFileType`

输出：

- `metadata: WorkbenchPathInfo`
- `baseHash: String`
- `baseModifiedAt: Option<String>`

行为：

- 只允许保存 Markdown、代码、普通文本、JSON、TOML。
- CSV、SQLite、图片、二进制拒绝保存。
- 保存前比较 `baseHash` 或 `baseModifiedAt`；不一致返回冲突错误。
- JSON/TOML 必须再次语义校验，失败拒绝落盘。
- 保存走临时文件 + 原子替换。
- 保存前后都不能跟随外部 symlink 越界。

### format_workbench_structured_content

输入：

- `kind: "json" | "toml"`
- `content: String`

输出：

- `formatted: String`

行为：

- JSON parse 后 pretty print。
- TOML parse 后按 crate 支持的 serializer 输出规范 TOML。
- 失败返回包含行列信息的错误。

### preview_workbench_csv

输入：

- `projectId`
- `worktreeId`
- `path`
- `limitRows`

输出：

- `columns: Vec<String>`
- `rows: Vec<Vec<String>>`
- `rowCount: Option<u64>`
- `truncated: bool`

行为：

- 只读。
- 支持 BOM。
- 支持无 header CSV，列名 fallback 为 `column_1`。
- 超过行数返回 `truncated=true`。

### preview_workbench_sqlite

输入：

- `projectId`
- `worktreeId`
- `path`
- `table: Option<String>`
- `limitRows`

输出：

- `tables`
- `columns`
- `rows`
- `truncated`

行为：

- 只读打开 SQLite。
- 禁止执行用户输入 SQL。
- 默认选择第一个用户表。
- 返回值全部转成字符串或 JSON-safe primitive。

## 安全限制

建议第一版限制：

- 文本可编辑文件最大 5 MiB。
- 文本初次打开超过 1 MiB 时允许提示“大文件模式”，第一版可直接拒绝编辑。
- 图片原始文件最大 10 MiB。
- 图片解码最大像素 8192 x 8192。
- CSV 预览最大读取 2 MiB 或 2000 行。
- SQLite 预览最大 DB 文件 100 MiB。
- SQLite 默认每表预览 100 行。

所有限制必须在后端执行，前端只负责展示原因。

## 错误处理

需要覆盖的错误状态：

- 文件不存在。
- 路径越界。
- 路径是目录。
- 文件过大。
- 非 UTF-8。
- 外部修改冲突。
- JSON/TOML 校验失败。
- SQLite 文件损坏或被锁。
- CSV 解析失败。
- 图片格式不支持。

错误展示位置：

- tab 内显示文件级错误。
- 右侧文件树保留可操作。
- 不影响终端会话。

## 测试计划

### Rust

建议命令：

```bash
cd src-tauri
cargo test workbench::fs --lib
cargo test workbench::file_content --lib
cargo test workbench::file_preview --lib
cargo test workbench::sqlite_preview --lib
cargo check
```

覆盖：

- 路径越界拒绝。
- 外部 symlink 拒绝。
- 文本读写 hash 冲突。
- 原子保存。
- JSON 校验失败拒绝保存。
- TOML 校验失败拒绝保存。
- JSON/TOML 格式化成功。
- CSV 只读预览截断。
- SQLite 只读 schema/table 预览。

### 前端

建议命令：

```bash
cd web
npx --yes tsx src/pages/Workbench/workbenchFiles.test.ts
npm run build
npm run lint
```

覆盖：

- 文件类型识别。
- capability 判断。
- dirty tab 关闭保护。
- JSON/TOML 保存前校验。
- Markdown 模式切换状态。
- active project/worktree 切换时丢弃旧请求。

### 浏览器验证

用 Workbench 实际打开一个测试项目，验证：

- 打开 Markdown 后中央区域进入文件 tab。
- WYSIWYG、源码、拆分模式可切换。
- 保存 Markdown 后内容落盘。
- 打开代码文件有高亮。
- JSON/TOML 格式化和保存前校验生效。
- CSV 只读表格可滚动。
- SQLite 只读表列表和前 N 行可见。
- 返回终端后原 terminal window/pane 仍保持原状态。

## 文档更新

实现阶段需要同步更新：

- `docs/prd.md`：Workbench 文件夹功能从“第一期不做文件内容预览”更新为“文件工作区支持的类型能力矩阵”。
- `web/CLAUDE.md`：记录前端组件、编辑器栈、测试命令。
- `src-tauri/CLAUDE.md`：记录后端命令、安全限制、验证命令。
- 根 `AGENTS.md`：如新增 domain 组件，需要在组件清单中补充 `WorkbenchFileWorkspace`、`WorkbenchCodeEditor`、`WorkbenchMarkdownEditor`、`WorkbenchImagePreview`、`WorkbenchCsvPreview`、`WorkbenchSqlitePreview`。

## 实施分期

### Phase 1：基础文件工作区

- 文件 tab 状态。
- 打开/关闭/返回终端。
- 普通文本和代码 CodeMirror 编辑保存。
- 后端文本读写和 hash 冲突保护。

### Phase 2：Markdown 和结构化文本

- Markdown WYSIWYG / source / split。
- JSON/TOML 格式化、校验、保存。
- 前后端校验一致。

### Phase 3：只读预览器

- 图片预览。
- CSV 只读表格。
- SQLite 只读 schema/table 浏览。

### Phase 4：体验和回归

- dirty tab 切换保护。
- 大文件/错误状态打磨。
- 浏览器验证和文档更新。

