# Workbench File Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Workbench 中实现 B1 文件标签页工作区：打开文件时中央终端区临时切到文件 tab，支持代码高亮编辑、Typora 式 Markdown、JSON/TOML 校验格式化、图片/CSV/SQLite 只读预览，并保留终端会话状态。

**Architecture:** 后端在 `src-tauri/src/workbench/` 下新增文件内容和只读预览模块，继续复用现有 worktree 根路径安全边界；前端新增 Workbench 文件工作区 domain 组件，CodeMirror 负责源码/代码编辑，Tiptap Markdown 负责所见即所得 Markdown。`Workbench.tsx` 只作为 orchestrator 接入文件 tab 状态，避免继续膨胀成单文件巨型实现。

**Tech Stack:** Rust + Tauri 2 + sqlx(SQLite) + `csv` + `toml_edit` + `sha2` + `base64` + `image`；React 19 + TypeScript + Vite + CodeMirror 6 + `@uiw/react-codemirror` + Tiptap 3 + `@tiptap/markdown` + react-i18next。

---

## Global Constraints

- 当前主工作区有未提交改动；实现必须在隔离 worktree 中进行，不直接改 `/Users/hans/web_project/cc-partner`。
- 实现代码量明显超过 100 行，按项目规则使用 subagent。编码类 subagent 使用 `gpt-5.5` + `xhigh`。
- 所有 Rust 新增函数、结构体、impl 方法必须有中文 doc comment，包含 `Business Logic` / `Code Logic`。
- 所有新增 React 组件和 helper 函数必须有中文 doc comment。
- React hooks 必须在任何 early return 之前。
- 前端用户可见文案全部进入 `web/src/i18n/locales/{zh,en}/workbench.json`，组件内不硬编码中英文文案。
- CSS 使用 design token，不硬编码颜色、字体、间距、圆角、阴影；CodeMirror/Tiptap 内部主题通过 token 映射。
- CSV 第一版只读预览，不提供原文编辑或单元格编辑。
- SQLite 第一版只读预览，不提供 SQL 执行、写入、行编辑。
- JSON/TOML 前端即时校验，后端保存前再次校验；后端校验失败时拒绝落盘。
- Markdown WYSIWYG 保存时允许规范化 Markdown，不要求逐字符保留原源码格式。

## File Structure

### Rust 后端

| 文件 | 责任 |
| --- | --- |
| `src-tauri/Cargo.toml` | 增加 `csv`、`toml_edit` 依赖；复用现有 `sha2`、`base64`、`image`、`sqlx` |
| `src-tauri/src/workbench/mod.rs` | 导出 `file_content`、`file_preview`、`sqlite_preview` |
| `src-tauri/src/workbench/models.rs` | 新增文件内容、预览、capability DTO |
| `src-tauri/src/workbench/file_content.rs` | 文本读取、保存、hash、JSON/TOML 校验和格式化 |
| `src-tauri/src/workbench/file_preview.rs` | 文件类型识别、图片预览 data URL、CSV 只读预览 |
| `src-tauri/src/workbench/sqlite_preview.rs` | SQLite 只读 schema/table/rows 预览 |
| `src-tauri/src/commands/workbench.rs` | 新增打开、保存、格式化、CSV/SQLite 预览命令 thin layer |
| `src-tauri/src/lib.rs` | 注册新增 Tauri commands |
| `src-tauri/CLAUDE.md` | 记录后端命令、安全限制和验证命令 |

### React 前端

| 文件 | 责任 |
| --- | --- |
| `web/package.json` / `web/package-lock.json` | 增加 CodeMirror/Tiptap/TOML 前端校验依赖 |
| `web/src/lib/types.ts` | 新增 Workbench 文件内容/预览 DTO 类型 |
| `web/src/api/workbench.ts` | 扩展 `workbenchApi.files` 内容和预览 API |
| `web/src/pages/Workbench/workbenchFiles.ts` | 文件类型、能力、tab reducer、JSON/TOML 前端校验 |
| `web/src/pages/Workbench/workbenchFiles.test.ts` | helper 单元测试 |
| `web/src/components/domain/WorkbenchCodeEditor/` | CodeMirror 封装 |
| `web/src/components/domain/WorkbenchMarkdownEditor/` | Tiptap Markdown + source/split 模式 |
| `web/src/components/domain/WorkbenchImagePreview/` | 图片只读预览 |
| `web/src/components/domain/WorkbenchCsvPreview/` | CSV 只读表格 |
| `web/src/components/domain/WorkbenchSqlitePreview/` | SQLite 只读表/字段/行预览 |
| `web/src/components/domain/WorkbenchFileWorkspace/` | 中央文件 tab 工作区 |
| `web/src/pages/Workbench/Workbench.tsx` | 接入文件工作区，保留终端实例 |
| `web/src/pages/Workbench/Workbench.module.css` | 文件工作区布局样式 |
| `web/src/i18n/locales/{zh,en}/workbench.json` | 新增文案 |
| `web/CLAUDE.md` | 记录前端文件工作区约定和测试命令 |

### 文档

| 文件 | 责任 |
| --- | --- |
| `docs/prd.md` | 更新 Workbench 文件浏览/编辑需求，替换旧的“不做文件内容预览”描述 |
| `AGENTS.md` | 如果新增 domain 组件，更新组件清单；保持根文档精简 |

## Dependency Commands

前端依赖安装命令：

```bash
cd web
npm install @uiw/react-codemirror codemirror @codemirror/lang-javascript @codemirror/lang-json @codemirror/lang-markdown @codemirror/lang-css @codemirror/lang-html @codemirror/lang-python @codemirror/lang-rust @codemirror/legacy-modes @codemirror/language @codemirror/search @codemirror/autocomplete @codemirror/lint @tiptap/react @tiptap/starter-kit @tiptap/markdown @tiptap/static-renderer smol-toml
```

后端依赖编辑 `src-tauri/Cargo.toml`：

```toml
# Workbench file workspace: CSV preview and TOML validation/formatting
csv = "1.4"
toml_edit = "0.25"
```

## Task 1: Frontend File Type Helpers

**Files:**
- Create: `web/src/pages/Workbench/workbenchFiles.ts`
- Create: `web/src/pages/Workbench/workbenchFiles.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `web/src/pages/Workbench/workbenchFiles.test.ts`:

```ts
import {
  detectWorkbenchFileType,
  fileCapabilitiesForType,
  reduceFileTabs,
  validateJsonText,
  validateTomlText,
} from './workbenchFiles';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  assert(detectWorkbenchFileType('README.md', null) === 'markdown', 'markdown extension detected');
  assert(detectWorkbenchFileType('src/App.tsx', null) === 'code', 'tsx extension detected as code');
  assert(detectWorkbenchFileType('data.csv', null) === 'csv', 'csv extension detected');
  assert(detectWorkbenchFileType('config.toml', null) === 'toml', 'toml extension detected');
  assert(detectWorkbenchFileType('data.sqlite', null) === 'sqlite', 'sqlite extension detected');
  assert(detectWorkbenchFileType('logo.png', null) === 'image', 'png extension detected');

  const jsonCaps = fileCapabilitiesForType('json');
  assert(jsonCaps.canEdit, 'json is editable');
  assert(jsonCaps.canFormat, 'json can format');
  assert(jsonCaps.mustValidateBeforeSave, 'json validates before save');

  const csvCaps = fileCapabilitiesForType('csv');
  assert(!csvCaps.canEdit, 'csv is not editable');
  assert(csvCaps.canPreview, 'csv can preview');

  const tabs = reduceFileTabs(
    { tabs: [], activeTabId: null, view: 'terminal' },
    { type: 'opened', tab: { id: 'readme', path: 'README.md', name: 'README.md', detectedType: 'markdown', mode: 'wysiwyg', dirty: false } },
  );
  assert(tabs.activeTabId === 'readme', 'opened tab becomes active');
  assert(tabs.view === 'files', 'opening file switches to files view');

  assert(validateJsonText('{"ok":true}').ok, 'valid json accepted');
  assert(!validateJsonText('{bad').ok, 'invalid json rejected');
  assert(validateTomlText('title = "cc-partner"').ok, 'valid toml accepted');
  assert(!validateTomlText('title = ').ok, 'invalid toml rejected');
}

void main();
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
cd web
npx --yes tsx src/pages/Workbench/workbenchFiles.test.ts
```

Expected: FAIL because `workbenchFiles.ts` does not exist.

- [ ] **Step 3: Implement helper module**

Create `web/src/pages/Workbench/workbenchFiles.ts`:

```ts
import { parse as parseToml } from 'smol-toml';

export type WorkbenchDetectedFileType =
  | 'image'
  | 'markdown'
  | 'code'
  | 'json'
  | 'toml'
  | 'csv'
  | 'sqlite'
  | 'text'
  | 'binary'
  | 'unsupported';

export type WorkbenchFileMode = 'viewer' | 'editor' | 'wysiwyg' | 'source' | 'split';

export interface WorkbenchFileCapabilities {
  canPreview: boolean;
  canEdit: boolean;
  canFormat: boolean;
  mustValidateBeforeSave: boolean;
}

export interface WorkbenchFileTab {
  id: string;
  path: string;
  name: string;
  detectedType: WorkbenchDetectedFileType;
  mode: WorkbenchFileMode;
  dirty: boolean;
}

export interface WorkbenchFileTabsState {
  tabs: WorkbenchFileTab[];
  activeTabId: string | null;
  view: 'terminal' | 'files';
}

export type WorkbenchFileTabsAction =
  | { type: 'opened'; tab: WorkbenchFileTab }
  | { type: 'closed'; id: string }
  | { type: 'activated'; id: string }
  | { type: 'returnedToTerminal' }
  | { type: 'markedDirty'; id: string; dirty: boolean }
  | { type: 'cleared' };

export interface ValidationResult {
  ok: boolean;
  message: string | null;
}

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const markdownExtensions = new Set(['.md', '.markdown', '.mdx']);
const jsonExtensions = new Set(['.json']);
const tomlExtensions = new Set(['.toml']);
const csvExtensions = new Set(['.csv']);
const sqliteExtensions = new Set(['.sqlite', '.sqlite3', '.db']);
const codeExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.rs',
  '.py',
  '.css',
  '.html',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.yml',
  '.yaml',
]);

/**
 * Business Logic（为什么需要这个函数）:
 *   Workbench 文件树只返回路径元信息，前端需要按扩展名决定打开哪个预览/编辑器。
 *
 * Code Logic（这个函数做什么）:
 *   从文件名扩展名推断第一版支持的文件类型；mime 为空时仍可工作。
 */
export function detectWorkbenchFileType(
  filename: string,
  mime: string | null,
): WorkbenchDetectedFileType {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot >= 0 ? lower.slice(dot) : '';
  if (mime?.startsWith('image/') || imageExtensions.has(ext)) return 'image';
  if (markdownExtensions.has(ext)) return 'markdown';
  if (jsonExtensions.has(ext)) return 'json';
  if (tomlExtensions.has(ext)) return 'toml';
  if (csvExtensions.has(ext)) return 'csv';
  if (sqliteExtensions.has(ext)) return 'sqlite';
  if (codeExtensions.has(ext)) return 'code';
  return 'text';
}

/**
 * Business Logic（为什么需要这个函数）:
 *   文件 tab 工具栏需要稳定展示可执行动作，避免 CSV/SQLite 误出现保存按钮。
 *
 * Code Logic（这个函数做什么）:
 *   把检测出的文件类型映射为预览、编辑、格式化、保存前校验能力。
 */
export function fileCapabilitiesForType(type: WorkbenchDetectedFileType): WorkbenchFileCapabilities {
  switch (type) {
    case 'markdown':
    case 'code':
    case 'text':
      return { canPreview: true, canEdit: true, canFormat: false, mustValidateBeforeSave: false };
    case 'json':
    case 'toml':
      return { canPreview: true, canEdit: true, canFormat: true, mustValidateBeforeSave: true };
    case 'image':
    case 'csv':
    case 'sqlite':
      return { canPreview: true, canEdit: false, canFormat: false, mustValidateBeforeSave: false };
    case 'binary':
    case 'unsupported':
      return { canPreview: false, canEdit: false, canFormat: false, mustValidateBeforeSave: false };
  }
}

/**
 * Business Logic（为什么需要这个函数）:
 *   中央文件工作区需要可测试的 tab 状态流，避免把复杂状态散落在 Workbench.tsx。
 *
 * Code Logic（这个函数做什么）:
 *   以 reducer 形式处理打开、关闭、激活、dirty 标记和返回终端动作。
 */
export function reduceFileTabs(
  state: WorkbenchFileTabsState,
  action: WorkbenchFileTabsAction,
): WorkbenchFileTabsState {
  switch (action.type) {
    case 'opened': {
      const exists = state.tabs.some((tab) => tab.id === action.tab.id);
      return {
        tabs: exists
          ? state.tabs.map((tab) => (tab.id === action.tab.id ? { ...tab, ...action.tab } : tab))
          : [...state.tabs, action.tab],
        activeTabId: action.tab.id,
        view: 'files',
      };
    }
    case 'closed': {
      const tabs = state.tabs.filter((tab) => tab.id !== action.id);
      const activeTabId =
        state.activeTabId === action.id ? tabs[tabs.length - 1]?.id ?? null : state.activeTabId;
      return { tabs, activeTabId, view: activeTabId ? 'files' : 'terminal' };
    }
    case 'activated':
      return { ...state, activeTabId: action.id, view: 'files' };
    case 'returnedToTerminal':
      return { ...state, view: 'terminal' };
    case 'markedDirty':
      return {
        ...state,
        tabs: state.tabs.map((tab) => (tab.id === action.id ? { ...tab, dirty: action.dirty } : tab)),
      };
    case 'cleared':
      return { tabs: [], activeTabId: null, view: 'terminal' };
  }
}

/**
 * Business Logic（为什么需要这个函数）:
 *   JSON 文件保存前必须在前端即时提示语义错误，减少无效后端调用。
 *
 * Code Logic（这个函数做什么）:
 *   调用 JSON.parse，返回统一 ValidationResult。
 */
export function validateJsonText(text: string): ValidationResult {
  try {
    JSON.parse(text);
    return { ok: true, message: null };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}

/**
 * Business Logic（为什么需要这个函数）:
 *   TOML 文件保存前必须在前端即时提示语义错误，避免无效内容落盘。
 *
 * Code Logic（这个函数做什么）:
 *   调用 smol-toml parse，返回统一 ValidationResult。
 */
export function validateTomlText(text: string): ValidationResult {
  try {
    parseToml(text);
    return { ok: true, message: null };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Invalid TOML' };
  }
}
```

- [ ] **Step 4: Run test and verify it passes**

Run:

```bash
cd web
npx --yes tsx src/pages/Workbench/workbenchFiles.test.ts
```

Expected: PASS with no output.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Workbench/workbenchFiles.ts web/src/pages/Workbench/workbenchFiles.test.ts web/package.json web/package-lock.json
git commit -m "feat: add workbench file helpers"
```

## Task 2: Rust DTOs and Content Modules

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/workbench/mod.rs`
- Modify: `src-tauri/src/workbench/models.rs`
- Create: `src-tauri/src/workbench/file_content.rs`
- Create: `src-tauri/src/workbench/file_preview.rs`
- Create: `src-tauri/src/workbench/sqlite_preview.rs`

- [ ] **Step 1: Add Rust dependencies**

Edit `src-tauri/Cargo.toml`:

```toml
# Workbench file workspace: CSV preview and TOML validation/formatting
csv = "1.4"
toml_edit = "0.25"
```

- [ ] **Step 2: Add model definitions**

Append to `src-tauri/src/workbench/models.rs`:

```rust
/// Workbench 文件检测类型。
///
/// Business Logic（为什么需要这个类型）:
///     前端需要知道文件应由代码编辑器、Markdown 编辑器、图片预览器、CSV 预览器还是 SQLite 预览器打开。
///
/// Code Logic（这个类型做什么）:
///     通过 serde camelCase/lowercase 风格序列化为前端可判定的枚举字符串。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorkbenchDetectedFileType {
    Image,
    Markdown,
    Code,
    Json,
    Toml,
    Csv,
    Sqlite,
    Text,
    Binary,
    Unsupported,
}

/// Workbench 文件能力 DTO。
///
/// Business Logic（为什么需要这个结构）:
///     UI 工具栏必须可靠隐藏不可用动作，例如 CSV/SQLite 第一版不能保存。
///
/// Code Logic（这个结构做什么）:
///     描述文件是否可预览、可编辑、可格式化、保存前是否必须校验。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchFileCapabilities {
    pub can_preview: bool,
    pub can_edit: bool,
    pub can_format: bool,
    pub must_validate_before_save: bool,
}

/// Workbench 文本内容 DTO。
///
/// Business Logic（为什么需要这个结构）:
///     可编辑文件打开后需要携带内容和并发保存基线，避免外部修改被静默覆盖。
///
/// Code Logic（这个结构做什么）:
///     content 为 UTF-8 文本，base_hash/base_modified_at 用于保存前乐观锁。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchTextContent {
    pub content: String,
    pub base_hash: String,
    pub base_modified_at: Option<String>,
}

/// Workbench CSV 预览 DTO。
///
/// Business Logic（为什么需要这个结构）:
///     CSV 第一版只读展示表格，用户需要看到列、行和截断状态。
///
/// Code Logic（这个结构做什么）:
///     columns 保存表头或 fallback 列名，rows 保存 JSON-safe 字符串表格。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchCsvPreview {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub truncated: bool,
}

/// Workbench 图片预览 DTO。
///
/// Business Logic（为什么需要这个结构）:
///     图片文件需要在应用内查看，不应按文本读取。
///
/// Code Logic（这个结构做什么）:
///     data_url 给前端 img 使用，width/height 在可解码时返回。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchImagePreview {
    pub data_url: String,
    pub mime: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// Workbench SQLite 表行预览 DTO。
///
/// Business Logic（为什么需要这个结构）:
///     SQLite 第一版只读浏览 schema/table，避免直接写 DB 造成数据损坏。
///
/// Code Logic（这个结构做什么）:
///     tables 为库内用户表，columns/rows 为当前表前 N 行。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchSqlitePreview {
    pub tables: Vec<String>,
    pub selected_table: Option<String>,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub truncated: bool,
}

/// Workbench 文件打开响应 DTO。
///
/// Business Logic（为什么需要这个结构）:
///     打开文件时前端需要一次拿到元信息、类型、能力和具体内容/预览数据。
///
/// Code Logic（这个结构做什么）:
///     用 Option 字段承载互斥内容；不支持或超限时只返回 notice。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchOpenFileDto {
    pub metadata: WorkbenchPathInfo,
    pub detected_type: WorkbenchDetectedFileType,
    pub capabilities: WorkbenchFileCapabilities,
    pub text: Option<WorkbenchTextContent>,
    pub image: Option<WorkbenchImagePreview>,
    pub csv: Option<WorkbenchCsvPreview>,
    pub sqlite: Option<WorkbenchSqlitePreview>,
    pub truncated: bool,
    pub notice: Option<String>,
}

/// Workbench 文本保存响应 DTO。
///
/// Business Logic（为什么需要这个结构）:
///     保存成功后前端需要刷新 metadata 和下一次保存使用的 hash 基线。
///
/// Code Logic（这个结构做什么）:
///     metadata 返回最新文件信息，base_hash/base_modified_at 更新 tab 的乐观锁状态。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchSaveTextResultDto {
    pub metadata: WorkbenchPathInfo,
    pub base_hash: String,
    pub base_modified_at: Option<String>,
}
```

- [ ] **Step 3: Export new modules**

Edit `src-tauri/src/workbench/mod.rs`:

```rust
pub mod file_content;
pub mod file_preview;
pub mod sqlite_preview;
```

- [ ] **Step 4: Create failing Rust tests for text/hash/format**

Create `src-tauri/src/workbench/file_content.rs` with test skeleton and minimal compile imports:

```rust
use std::path::Path;

use crate::error::AppError;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn json_format_rejects_invalid_json() {
        let err = format_structured_content("json", "{bad").expect_err("invalid json rejected");
        assert!(err.to_string().contains("JSON"));
    }

    #[test]
    fn toml_format_rejects_invalid_toml() {
        let err = format_structured_content("toml", "title = ").expect_err("invalid toml rejected");
        assert!(err.to_string().contains("TOML"));
    }

    #[test]
    fn text_hash_changes_after_write() {
        let dir = tempfile_dir();
        let path = dir.join("note.md");
        fs::write(&path, "one").unwrap();
        let first = sha256_file_hex(&path).unwrap();
        fs::write(&path, "two").unwrap();
        let second = sha256_file_hex(&path).unwrap();
        assert_ne!(first, second);
    }

    fn tempfile_dir() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("cc-partner-file-content-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }
}
```

- [ ] **Step 5: Run test and verify it fails**

Run:

```bash
cd src-tauri
cargo test workbench::file_content --lib
```

Expected: FAIL because `format_structured_content` and `sha256_file_hex` do not exist.

- [ ] **Step 6: Implement `file_content.rs`**

Replace the file with:

```rust
use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};

use crate::error::AppError;

pub const MAX_EDITABLE_TEXT_BYTES: u64 = 5 * 1024 * 1024;

/// 计算文件 SHA256。
///
/// Business Logic（为什么需要这个函数）:
///     文件编辑保存需要乐观锁，避免用户打开后外部进程修改文件却被应用静默覆盖。
///
/// Code Logic（这个函数做什么）:
///     以流式读取方式计算文件内容 SHA256，返回 hex 字符串。
pub fn sha256_file_hex(path: &Path) -> Result<String, AppError> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// 读取 UTF-8 文本文件。
///
/// Business Logic（为什么需要这个函数）:
///     Workbench 文件 tab 需要打开可编辑文本，同时拒绝超大文件和非 UTF-8 内容。
///
/// Code Logic（这个函数做什么）:
///     检查文件大小后 read_to_string，返回内容和 hash 基线。
pub fn read_text_file(path: &Path) -> Result<(String, String), AppError> {
    let metadata = fs::metadata(path)?;
    if metadata.len() > MAX_EDITABLE_TEXT_BYTES {
        return Err(AppError::Bad(format!(
            "文件超过可编辑上限 {} bytes",
            MAX_EDITABLE_TEXT_BYTES
        )));
    }
    let content = fs::read_to_string(path)
        .map_err(|err| AppError::Bad(format!("文件不是有效 UTF-8 文本: {err}")))?;
    let hash = sha256_file_hex(path)?;
    Ok((content, hash))
}

/// 保存 UTF-8 文本文件。
///
/// Business Logic（为什么需要这个函数）:
///     用户编辑文件后需要安全落盘，同时不能覆盖外部修改。
///
/// Code Logic（这个函数做什么）:
///     比较 base_hash 与当前 hash；一致时写临时文件并 rename 原子替换。
pub fn save_text_file_atomic(path: &Path, content: &str, base_hash: &str) -> Result<String, AppError> {
    if content.len() as u64 > MAX_EDITABLE_TEXT_BYTES {
        return Err(AppError::Bad(format!(
            "保存内容超过可编辑上限 {} bytes",
            MAX_EDITABLE_TEXT_BYTES
        )));
    }
    let current_hash = sha256_file_hex(path)?;
    if current_hash != base_hash {
        return Err(AppError::generic("文件已被外部修改，请重新打开后再保存"));
    }
    let temp_path = temporary_save_path(path)?;
    fs::write(&temp_path, content)?;
    fs::rename(&temp_path, path)?;
    sha256_file_hex(path)
}

/// 格式化 JSON 或 TOML 内容。
///
/// Business Logic（为什么需要这个函数）:
///     JSON/TOML 在保存前必须语义校验，并提供格式化按钮。
///
/// Code Logic（这个函数做什么）:
///     JSON 走 serde_json pretty print；TOML 走 toml_edit parse 后 to_string。
pub fn format_structured_content(kind: &str, content: &str) -> Result<String, AppError> {
    match kind {
        "json" => {
            let value: serde_json::Value = serde_json::from_str(content)
                .map_err(|err| AppError::Bad(format!("JSON 校验失败: {err}")))?;
            Ok(serde_json::to_string_pretty(&value)?)
        }
        "toml" => {
            let doc = content
                .parse::<toml_edit::DocumentMut>()
                .map_err(|err| AppError::Bad(format!("TOML 校验失败: {err}")))?;
            Ok(doc.to_string())
        }
        other => Err(AppError::Bad(format!("不支持格式化类型: {other}"))),
    }
}

/// 构造临时保存路径。
///
/// Business Logic（为什么需要这个函数）:
///     原子保存需要同目录临时文件，确保 rename 不跨文件系统。
///
/// Code Logic（这个函数做什么）:
///     在原文件名后追加唯一后缀，父目录缺失时返回 IO 错误。
fn temporary_save_path(path: &Path) -> Result<PathBuf, AppError> {
    let parent = path.parent().ok_or_else(|| io::Error::new(io::ErrorKind::Other, "缺少父目录"))?;
    let name = path
        .file_name()
        .and_then(|v| v.to_str())
        .ok_or_else(|| io::Error::new(io::ErrorKind::Other, "文件名不是 UTF-8"))?;
    Ok(parent.join(format!(".{name}.cc-partner-{}", uuid::Uuid::new_v4())))
}
```

- [ ] **Step 7: Run Rust test**

Run:

```bash
cd src-tauri
cargo test workbench::file_content --lib
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/workbench/mod.rs src-tauri/src/workbench/models.rs src-tauri/src/workbench/file_content.rs
git commit -m "feat: add workbench file content core"
```

## Task 3: Rust CSV, Image, and SQLite Preview

**Files:**
- Modify: `src-tauri/src/workbench/file_preview.rs`
- Modify: `src-tauri/src/workbench/sqlite_preview.rs`
- Modify: `src-tauri/src/workbench/models.rs`

- [ ] **Step 1: Write failing preview tests**

Create tests in `file_preview.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn csv_preview_reads_header_and_rows() {
        let dir = tempfile_dir();
        let path = dir.join("data.csv");
        fs::write(&path, "id,name\n1,alpha\n2,beta\n").unwrap();
        let preview = preview_csv_file(&path, 10).unwrap();
        assert_eq!(preview.columns, vec!["id", "name"]);
        assert_eq!(preview.rows.len(), 2);
        assert!(!preview.truncated);
    }

    #[test]
    fn detected_type_handles_sqlite_extensions() {
        assert_eq!(detect_file_type("app.db"), WorkbenchDetectedFileType::Sqlite);
        assert_eq!(detect_file_type("data.sqlite3"), WorkbenchDetectedFileType::Sqlite);
    }

    fn tempfile_dir() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("cc-partner-file-preview-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }
}
```

- [ ] **Step 2: Implement `file_preview.rs`**

```rust
use std::{fs, path::Path};

use base64::Engine;

use crate::{
    error::AppError,
    workbench::models::{
        WorkbenchCsvPreview, WorkbenchDetectedFileType, WorkbenchFileCapabilities,
        WorkbenchImagePreview,
    },
};

pub const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;
pub const MAX_CSV_BYTES: u64 = 2 * 1024 * 1024;

/// 检测 Workbench 文件类型。
///
/// Business Logic（为什么需要这个函数）:
///     后端必须给前端返回权威文件类型，不能只依赖前端扩展名判断。
///
/// Code Logic（这个函数做什么）:
///     按小写扩展名映射到第一版支持的文件类型。
pub fn detect_file_type(name: &str) -> WorkbenchDetectedFileType {
    let lower = name.to_lowercase();
    let ext = lower.rsplit_once('.').map(|(_, ext)| ext).unwrap_or("");
    match ext {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => WorkbenchDetectedFileType::Image,
        "md" | "markdown" | "mdx" => WorkbenchDetectedFileType::Markdown,
        "json" => WorkbenchDetectedFileType::Json,
        "toml" => WorkbenchDetectedFileType::Toml,
        "csv" => WorkbenchDetectedFileType::Csv,
        "db" | "sqlite" | "sqlite3" => WorkbenchDetectedFileType::Sqlite,
        "ts" | "tsx" | "js" | "jsx" | "rs" | "py" | "css" | "html" | "sh" | "bash" | "zsh"
        | "sql" | "yml" | "yaml" => WorkbenchDetectedFileType::Code,
        _ => WorkbenchDetectedFileType::Text,
    }
}

/// 计算文件能力。
///
/// Business Logic（为什么需要这个函数）:
///     后端返回能力用于约束前端保存和格式化按钮，防止 CSV/SQLite 被误保存。
///
/// Code Logic（这个函数做什么）:
///     按文件类型生成 capability DTO。
pub fn capabilities_for_type(kind: &WorkbenchDetectedFileType) -> WorkbenchFileCapabilities {
    match kind {
        WorkbenchDetectedFileType::Json | WorkbenchDetectedFileType::Toml => {
            WorkbenchFileCapabilities { can_preview: true, can_edit: true, can_format: true, must_validate_before_save: true }
        }
        WorkbenchDetectedFileType::Markdown | WorkbenchDetectedFileType::Code | WorkbenchDetectedFileType::Text => {
            WorkbenchFileCapabilities { can_preview: true, can_edit: true, can_format: false, must_validate_before_save: false }
        }
        WorkbenchDetectedFileType::Image | WorkbenchDetectedFileType::Csv | WorkbenchDetectedFileType::Sqlite => {
            WorkbenchFileCapabilities { can_preview: true, can_edit: false, can_format: false, must_validate_before_save: false }
        }
        WorkbenchDetectedFileType::Binary | WorkbenchDetectedFileType::Unsupported => {
            WorkbenchFileCapabilities { can_preview: false, can_edit: false, can_format: false, must_validate_before_save: false }
        }
    }
}

/// 读取图片预览。
///
/// Business Logic（为什么需要这个函数）:
///     用户打开图片时需要在应用内查看，不应把图片当作文本编辑。
///
/// Code Logic（这个函数做什么）:
///     限制原始字节大小，读取并编码为 data URL；可解码时返回宽高。
pub fn preview_image_file(path: &Path) -> Result<WorkbenchImagePreview, AppError> {
    let metadata = fs::metadata(path)?;
    if metadata.len() > MAX_IMAGE_BYTES {
        return Err(AppError::Bad(format!("图片超过预览上限 {} bytes", MAX_IMAGE_BYTES)));
    }
    let bytes = fs::read(path)?;
    let mime = image_mime(path);
    let dimensions = image::load_from_memory(&bytes).ok().map(|img| (img.width(), img.height()));
    let data_url = format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    );
    Ok(WorkbenchImagePreview {
        data_url,
        mime,
        width: dimensions.map(|v| v.0),
        height: dimensions.map(|v| v.1),
    })
}

/// 读取 CSV 只读预览。
///
/// Business Logic（为什么需要这个函数）:
///     CSV 第一版只读预览，用户需要表格结构但不能编辑。
///
/// Code Logic（这个函数做什么）:
///     使用 csv crate 读取 header 和前 limit_rows 行，超过限制返回 truncated。
pub fn preview_csv_file(path: &Path, limit_rows: usize) -> Result<WorkbenchCsvPreview, AppError> {
    let metadata = fs::metadata(path)?;
    if metadata.len() > MAX_CSV_BYTES {
        return Err(AppError::Bad(format!("CSV 超过预览上限 {} bytes", MAX_CSV_BYTES)));
    }
    let mut reader = csv::ReaderBuilder::new().flexible(true).from_path(path)?;
    let headers = reader
        .headers()
        .map(|headers| headers.iter().map(ToOwned::to_owned).collect::<Vec<_>>())
        .unwrap_or_default();
    let mut rows = Vec::new();
    let mut truncated = false;
    for result in reader.records() {
        if rows.len() >= limit_rows {
            truncated = true;
            break;
        }
        let record = result?;
        rows.push(record.iter().map(ToOwned::to_owned).collect());
    }
    let columns = if headers.is_empty() {
        let max_cols = rows.iter().map(Vec::len).max().unwrap_or(0);
        (1..=max_cols).map(|index| format!("column_{index}")).collect()
    } else {
        headers
    };
    Ok(WorkbenchCsvPreview { columns, rows, truncated })
}

/// 根据路径推断图片 MIME。
///
/// Business Logic（为什么需要这个函数）:
///     前端 img data URL 需要 MIME 才能正确渲染。
///
/// Code Logic（这个函数做什么）:
///     按扩展名返回常见图片 MIME。
fn image_mime(path: &Path) -> String {
    match path.extension().and_then(|value| value.to_str()).unwrap_or("").to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    }
    .to_string()
}
```

- [ ] **Step 3: Implement SQLite read-only preview**

Create `src-tauri/src/workbench/sqlite_preview.rs`:

```rust
use std::path::Path;

use sqlx::{sqlite::SqliteConnectOptions, Connection, Row, SqliteConnection};

use crate::{error::AppError, workbench::models::WorkbenchSqlitePreview};

pub const MAX_SQLITE_BYTES: u64 = 100 * 1024 * 1024;

/// 读取 SQLite 只读预览。
///
/// Business Logic（为什么需要这个函数）:
///     用户需要查看项目中的 SQLite DB，但第一版不能提供写入能力以免损坏数据。
///
/// Code Logic（这个函数做什么）:
///     只读连接数据库，列出用户表，并返回指定表或首表的前 limit_rows 行。
pub async fn preview_sqlite_file(
    path: &Path,
    selected_table: Option<String>,
    limit_rows: i64,
) -> Result<WorkbenchSqlitePreview, AppError> {
    let metadata = std::fs::metadata(path)?;
    if metadata.len() > MAX_SQLITE_BYTES {
        return Err(AppError::Bad(format!("SQLite 文件超过预览上限 {} bytes", MAX_SQLITE_BYTES)));
    }
    let options = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .create_if_missing(false);
    let mut conn = SqliteConnection::connect_with(&options).await?;
    let table_rows = sqlx::query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .fetch_all(&mut conn)
    .await?;
    let tables = table_rows
        .iter()
        .filter_map(|row| row.try_get::<String, _>("name").ok())
        .collect::<Vec<_>>();
    let table = selected_table.or_else(|| tables.first().cloned());
    let Some(table_name) = table else {
        return Ok(WorkbenchSqlitePreview {
            tables,
            selected_table: None,
            columns: Vec::new(),
            rows: Vec::new(),
            truncated: false,
        });
    };
    if !tables.iter().any(|candidate| candidate == &table_name) {
        return Err(AppError::Bad("SQLite 表不存在".to_string()));
    }
    let pragma_sql = format!("PRAGMA table_info({})", quote_identifier(&table_name));
    let column_rows = sqlx::query(&pragma_sql).fetch_all(&mut conn).await?;
    let columns = column_rows
        .iter()
        .filter_map(|row| row.try_get::<String, _>("name").ok())
        .collect::<Vec<_>>();
    let query_sql = format!("SELECT * FROM {} LIMIT {}", quote_identifier(&table_name), limit_rows + 1);
    let data_rows = sqlx::query(&query_sql).fetch_all(&mut conn).await?;
    let truncated = data_rows.len() as i64 > limit_rows;
    let rows = data_rows
        .into_iter()
        .take(limit_rows as usize)
        .map(|row| {
            (0..columns.len())
                .map(|index| sqlite_cell_to_string(&row, index))
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    Ok(WorkbenchSqlitePreview {
        tables,
        selected_table: Some(table_name),
        columns,
        rows,
        truncated,
    })
}

/// 引号包裹 SQLite identifier。
///
/// Business Logic（为什么需要这个函数）:
///     表名来自数据库文件，拼接 SQL 时必须避免 identifier 注入。
///
/// Code Logic（这个函数做什么）:
///     使用双引号包裹并转义内部双引号。
fn quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

/// SQLite cell 转字符串。
///
/// Business Logic（为什么需要这个函数）:
///     表格预览需要 JSON-safe 字符串，不应把 SQLite 类型细节暴露给前端。
///
/// Code Logic（这个函数做什么）:
///     依次尝试 String/i64/f64/bool，失败时返回空字符串。
fn sqlite_cell_to_string(row: &sqlx::sqlite::SqliteRow, index: usize) -> String {
    row.try_get::<String, _>(index)
        .or_else(|_| row.try_get::<i64, _>(index).map(|v| v.to_string()))
        .or_else(|_| row.try_get::<f64, _>(index).map(|v| v.to_string()))
        .unwrap_or_default()
}
```

- [ ] **Step 4: Run preview tests and cargo check**

Run:

```bash
cd src-tauri
cargo test workbench::file_preview --lib
cargo check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/workbench/file_preview.rs src-tauri/src/workbench/sqlite_preview.rs src-tauri/src/workbench/models.rs
git commit -m "feat: add workbench file previews"
```

## Task 4: Rust Commands and Frontend API Contract

**Files:**
- Modify: `src-tauri/src/commands/workbench.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/api/workbench.ts`

- [ ] **Step 1: Add frontend DTO types**

Append to `web/src/lib/types.ts`:

```ts
export type WorkbenchDetectedFileType =
  | 'image'
  | 'markdown'
  | 'code'
  | 'json'
  | 'toml'
  | 'csv'
  | 'sqlite'
  | 'text'
  | 'binary'
  | 'unsupported';

export interface WorkbenchFileCapabilities {
  canPreview: boolean;
  canEdit: boolean;
  canFormat: boolean;
  mustValidateBeforeSave: boolean;
}

export interface WorkbenchTextContent {
  content: string;
  baseHash: string;
  baseModifiedAt: string | null;
}

export interface WorkbenchImagePreview {
  dataUrl: string;
  mime: string;
  width: number | null;
  height: number | null;
}

export interface WorkbenchCsvPreview {
  columns: string[];
  rows: string[][];
  truncated: boolean;
}

export interface WorkbenchSqlitePreview {
  tables: string[];
  selectedTable: string | null;
  columns: string[];
  rows: string[][];
  truncated: boolean;
}

export interface WorkbenchOpenFile {
  metadata: WorkbenchPathInfo;
  detectedType: WorkbenchDetectedFileType;
  capabilities: WorkbenchFileCapabilities;
  text: WorkbenchTextContent | null;
  image: WorkbenchImagePreview | null;
  csv: WorkbenchCsvPreview | null;
  sqlite: WorkbenchSqlitePreview | null;
  truncated: boolean;
  notice: string | null;
}

export interface WorkbenchSaveTextResult {
  metadata: WorkbenchPathInfo;
  baseHash: string;
  baseModifiedAt: string | null;
}

export interface WorkbenchFormatResult {
  formatted: string;
}
```

- [ ] **Step 2: Extend `workbenchApi.files`**

Add to `web/src/api/workbench.ts` imports and `files` section:

```ts
import type {
  WorkbenchFormatResult,
  WorkbenchOpenFile,
  WorkbenchSaveTextResult,
} from '@/lib/types';
```

```ts
open: (projectId: string, path: string, worktreeId?: string | null) =>
  invoke<WorkbenchOpenFile>('open_workbench_file', {
    projectId,
    worktreeId: worktreeId ?? null,
    path,
  }),

saveText: (
  projectId: string,
  path: string,
  content: string,
  baseHash: string,
  detectedType: WorkbenchDetectedFileType,
  worktreeId?: string | null,
) =>
  invoke<WorkbenchSaveTextResult>('save_workbench_text_file', {
    projectId,
    worktreeId: worktreeId ?? null,
    path,
    content,
    baseHash,
    detectedType,
  }),

formatStructured: (kind: 'json' | 'toml', content: string) =>
  invoke<WorkbenchFormatResult>('format_workbench_structured_content', { kind, content }),

previewSqlite: (
  projectId: string,
  path: string,
  table?: string | null,
  limitRows = 100,
  worktreeId?: string | null,
) =>
  invoke<WorkbenchSqlitePreview>('preview_workbench_sqlite', {
    projectId,
    worktreeId: worktreeId ?? null,
    path,
    table: table ?? null,
    limitRows,
  }),
```

- [ ] **Step 3: Add command functions**

Append command functions near existing file commands in `src-tauri/src/commands/workbench.rs`:

```rust
#[tauri::command]
pub async fn open_workbench_file(
    state: State<'_, AppState>,
    project_id: String,
    worktree_id: Option<String>,
    path: String,
) -> Result<WorkbenchOpenFileDto, AppError> {
    let project = get_project(&state, &project_id).await?;
    let worktree = resolve_worktree(&state, &project, worktree_id.as_deref()).await?;
    let root = PathBuf::from(worktree.path);
    run_blocking_fs(move || workbench_fs::path_info(&root, &path)).await?;
    crate::workbench::file_preview::open_file_preview(&root, &path).await
}

#[tauri::command]
pub async fn save_workbench_text_file(
    state: State<'_, AppState>,
    project_id: String,
    worktree_id: Option<String>,
    path: String,
    content: String,
    base_hash: String,
    detected_type: WorkbenchDetectedFileType,
) -> Result<WorkbenchSaveTextResultDto, AppError> {
    let project = get_project(&state, &project_id).await?;
    let worktree = resolve_worktree(&state, &project, worktree_id.as_deref()).await?;
    let root = PathBuf::from(worktree.path);
    run_blocking_fs(move || {
        crate::workbench::file_content::save_text_by_type(&root, &path, &content, &base_hash, detected_type)
    })
    .await
}

#[tauri::command]
pub async fn format_workbench_structured_content(
    kind: String,
    content: String,
) -> Result<serde_json::Value, AppError> {
    let formatted = crate::workbench::file_content::format_structured_content(&kind, &content)?;
    Ok(serde_json::json!({ "formatted": formatted }))
}

#[tauri::command]
pub async fn preview_workbench_sqlite(
    state: State<'_, AppState>,
    project_id: String,
    worktree_id: Option<String>,
    path: String,
    table: Option<String>,
    limit_rows: Option<i64>,
) -> Result<WorkbenchSqlitePreview, AppError> {
    let project = get_project(&state, &project_id).await?;
    let worktree = resolve_worktree(&state, &project, worktree_id.as_deref()).await?;
    let root = PathBuf::from(worktree.path);
    let file_path = crate::workbench::projects::resolve_project_path(&root, &path)?;
    crate::workbench::sqlite_preview::preview_sqlite_file(&file_path, table, limit_rows.unwrap_or(100)).await
}
```

- [ ] **Step 4: Register commands**

Add to `src-tauri/src/lib.rs` generate handler after `delete_workbench_path`:

```rust
workbench_cmd::open_workbench_file,
workbench_cmd::save_workbench_text_file,
workbench_cmd::format_workbench_structured_content,
workbench_cmd::preview_workbench_sqlite,
```

- [ ] **Step 5: Run contract checks**

Run:

```bash
cd src-tauri
cargo check
cd ../web
npx tsc --noEmit
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/workbench.rs src-tauri/src/lib.rs web/src/lib/types.ts web/src/api/workbench.ts
git commit -m "feat: expose workbench file api"
```

## Task 5: CodeMirror Editor Component

**Files:**
- Create: `web/src/components/domain/WorkbenchCodeEditor/WorkbenchCodeEditor.tsx`
- Create: `web/src/components/domain/WorkbenchCodeEditor/WorkbenchCodeEditor.module.css`
- Create: `web/src/components/domain/WorkbenchCodeEditor/index.ts`

- [ ] **Step 1: Create component**

Create `WorkbenchCodeEditor.tsx`:

```tsx
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { useMemo } from 'react';
import styles from './WorkbenchCodeEditor.module.css';

export interface WorkbenchCodeEditorProps {
  value: string;
  language: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}

/**
 * Business Logic（为什么需要这个组件）:
 *   Workbench 文件工作区需要插件级代码高亮编辑体验，而不是普通 textarea。
 *
 * Code Logic（这个组件做什么）:
 *   封装 @uiw/react-codemirror，按 language 选择 CodeMirror extension，并把变更回传父级 tab。
 */
export function WorkbenchCodeEditor(props: WorkbenchCodeEditorProps): JSX.Element {
  const { value, language, readOnly = false, onChange } = props;
  const extensions = useMemo(() => languageExtensions(language), [language]);

  return (
    <div className={styles.editorShell}>
      <CodeMirror
        value={value}
        height="100%"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          bracketMatching: true,
          searchKeymap: true,
        }}
        editable={!readOnly}
        extensions={extensions}
        onChange={(next) => onChange(next)}
      />
    </div>
  );
}

/**
 * Business Logic（为什么需要这个函数）:
 *   不同文件类型需要不同语法高亮，未覆盖语言要稳定回退纯文本。
 *
 * Code Logic（这个函数做什么）:
 *   按内部 language 字符串返回 CodeMirror extensions。
 */
function languageExtensions(language: string) {
  switch (language) {
    case 'typescript':
      return [javascript({ typescript: true })];
    case 'tsx':
      return [javascript({ jsx: true, typescript: true })];
    case 'javascript':
      return [javascript()];
    case 'jsx':
      return [javascript({ jsx: true })];
    case 'json':
      return [json()];
    case 'markdown':
      return [markdown()];
    case 'css':
      return [css()];
    case 'html':
      return [html()];
    case 'python':
      return [python()];
    case 'rust':
      return [rust()];
    case 'toml':
      return [StreamLanguage.define(toml)];
    case 'shell':
      return [StreamLanguage.define(shell)];
    default:
      return [];
  }
}
```

Create `WorkbenchCodeEditor.module.css`:

```css
.editorShell {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.editorShell :global(.cm-editor) {
  height: 100%;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
```

Create `index.ts`:

```ts
export { WorkbenchCodeEditor } from './WorkbenchCodeEditor';
export type { WorkbenchCodeEditorProps } from './WorkbenchCodeEditor';
```

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
cd web
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/domain/WorkbenchCodeEditor
git commit -m "feat: add workbench code editor"
```

## Task 6: Markdown Editor Component

**Files:**
- Create: `web/src/components/domain/WorkbenchMarkdownEditor/WorkbenchMarkdownEditor.tsx`
- Create: `web/src/components/domain/WorkbenchMarkdownEditor/WorkbenchMarkdownEditor.module.css`
- Create: `web/src/components/domain/WorkbenchMarkdownEditor/index.ts`

- [ ] **Step 1: Create Markdown editor component**

Create `WorkbenchMarkdownEditor.tsx`:

```tsx
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import { renderToMarkdown } from '@tiptap/static-renderer';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useMemo, useState } from 'react';
import { WorkbenchCodeEditor } from '../WorkbenchCodeEditor';
import styles from './WorkbenchMarkdownEditor.module.css';

export type WorkbenchMarkdownMode = 'wysiwyg' | 'source' | 'split';

export interface WorkbenchMarkdownEditorProps {
  value: string;
  mode: WorkbenchMarkdownMode;
  onModeChange: (mode: WorkbenchMarkdownMode) => void;
  onChange: (value: string) => void;
}

/**
 * Business Logic（为什么需要这个组件）:
 *   Markdown 文件需要类似 Typora 的所见即所得体验，同时保留源码和拆分模式。
 *
 * Code Logic（这个组件做什么）:
 *   用 Tiptap Markdown 承载 WYSIWYG，用 CodeMirror 承载源码模式；内容变化统一回传 Markdown 字符串。
 */
export function WorkbenchMarkdownEditor(props: WorkbenchMarkdownEditorProps): JSX.Element {
  const { value, mode, onModeChange, onChange } = props;
  const [sourceValue, setSourceValue] = useState(value);
  const extensions = useMemo(() => [StarterKit, Markdown], []);
  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    immediatelyRender: false,
    onUpdate: ({ editor: activeEditor }) => {
      const markdown = renderToMarkdown({ extensions, content: activeEditor.getJSON() });
      setSourceValue(markdown);
      onChange(markdown);
    },
  });

  useEffect(() => {
    setSourceValue(value);
    if (!editor) return;
    const current = renderToMarkdown({ extensions, content: editor.getJSON() });
    if (current !== value) {
      editor.commands.setContent(value, { contentType: 'markdown' });
    }
  }, [editor, value]);

  return (
    <div className={styles.markdownShell}>
      <div className={styles.modeBar}>
        <button type="button" data-active={mode === 'wysiwyg' || undefined} onClick={() => onModeChange('wysiwyg')}>
          WYSIWYG
        </button>
        <button type="button" data-active={mode === 'source' || undefined} onClick={() => onModeChange('source')}>
          Source
        </button>
        <button type="button" data-active={mode === 'split' || undefined} onClick={() => onModeChange('split')}>
          Split
        </button>
      </div>
      <div className={styles.markdownBody} data-mode={mode}>
        {mode !== 'source' ? (
          <div className={styles.wysiwygPane}>
            <EditorContent editor={editor} />
          </div>
        ) : null}
        {mode !== 'wysiwyg' ? (
          <WorkbenchCodeEditor
            value={sourceValue}
            language="markdown"
            onChange={(next) => {
              setSourceValue(next);
              onChange(next);
              editor?.commands.setContent(next, { contentType: 'markdown' });
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
```

Create CSS:

```css
.markdownShell {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--space-2);
}

.modeBar {
  display: inline-flex;
  gap: var(--space-1);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: var(--space-1);
  background: var(--bg);
}

.modeBar button {
  border: 0;
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-3);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all var(--motion-fast) var(--ease-standard);
}

.modeBar button[data-active='true'] {
  background: var(--surface);
  color: var(--fg);
  box-shadow: var(--shadow-xs);
}

.markdownBody {
  min-height: 0;
  display: grid;
  gap: var(--space-3);
}

.markdownBody[data-mode='split'] {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.wysiwygPane {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  background: var(--surface);
}
```

Create index:

```ts
export { WorkbenchMarkdownEditor } from './WorkbenchMarkdownEditor';
export type { WorkbenchMarkdownEditorProps, WorkbenchMarkdownMode } from './WorkbenchMarkdownEditor';
```

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
cd web
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/domain/WorkbenchMarkdownEditor
git commit -m "feat: add workbench markdown editor"
```

## Task 7: Read-only Preview Components

**Files:**
- Create: `web/src/components/domain/WorkbenchImagePreview/*`
- Create: `web/src/components/domain/WorkbenchCsvPreview/*`
- Create: `web/src/components/domain/WorkbenchSqlitePreview/*`

- [ ] **Step 1: Create image preview**

Create `web/src/components/domain/WorkbenchImagePreview/WorkbenchImagePreview.tsx`:

```tsx
import type { WorkbenchImagePreview as WorkbenchImagePreviewDto } from '@/lib/types';
import styles from './WorkbenchImagePreview.module.css';

export interface WorkbenchImagePreviewProps {
  preview: WorkbenchImagePreviewDto;
  name: string;
}

/**
 * Business Logic（为什么需要这个组件）:
 *   用户在 Workbench 中选中图片后需要直接查看图像，不应跳出应用或按文本打开。
 *
 * Code Logic（这个组件做什么）:
 *   渲染后端返回的 data URL，并展示 MIME、宽高等只读元信息。
 */
export function WorkbenchImagePreview(props: WorkbenchImagePreviewProps): JSX.Element {
  const { preview, name } = props;
  return (
    <div className={styles.imagePreview}>
      <img src={preview.dataUrl} alt={name} />
      <div className={styles.imageMeta}>
        {preview.mime}
        {preview.width && preview.height ? ` · ${preview.width} x ${preview.height}` : ''}
      </div>
    </div>
  );
}
```

Create matching CSS and `index.ts`.

- [ ] **Step 2: Create CSV preview**

Create `WorkbenchCsvPreview.tsx`:

```tsx
import type { WorkbenchCsvPreview as WorkbenchCsvPreviewDto } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import styles from './WorkbenchCsvPreview.module.css';

export interface WorkbenchCsvPreviewProps {
  preview: WorkbenchCsvPreviewDto;
}

/**
 * Business Logic（为什么需要这个组件）:
 *   CSV 第一版是只读表格预览，用户需要快速检查结构和前几行数据。
 *
 * Code Logic（这个组件做什么）:
 *   渲染 columns 和 rows，截断时显示提示，不提供编辑入口。
 */
export function WorkbenchCsvPreview(props: WorkbenchCsvPreviewProps): JSX.Element {
  const { preview } = props;
  const { t } = useTranslation(['workbench']);
  return (
    <div className={styles.tableScroller}>
      <table className={styles.previewTable}>
        <thead>
          <tr>{preview.columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {preview.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {preview.columns.map((column, columnIndex) => (
                <td key={`${column}-${columnIndex}`}>{row[columnIndex] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {preview.truncated ? <p className={styles.truncated}>{t('workbench:filePreviewTruncated')}</p> : null}
    </div>
  );
}
```

Create matching CSS and `index.ts`.

- [ ] **Step 3: Create SQLite preview**

Create `WorkbenchSqlitePreview.tsx`:

```tsx
import type { WorkbenchSqlitePreview as WorkbenchSqlitePreviewDto } from '@/lib/types';
import styles from './WorkbenchSqlitePreview.module.css';

export interface WorkbenchSqlitePreviewProps {
  preview: WorkbenchSqlitePreviewDto;
  onSelectTable: (table: string) => void;
}

/**
 * Business Logic（为什么需要这个组件）:
 *   SQLite 第一版只读浏览，用户需要查看表结构和前 N 行，不允许写入。
 *
 * Code Logic（这个组件做什么）:
 *   左侧渲染表列表，右侧渲染当前表 columns/rows。
 */
export function WorkbenchSqlitePreview(props: WorkbenchSqlitePreviewProps): JSX.Element {
  const { preview, onSelectTable } = props;
  return (
    <div className={styles.sqlitePreview}>
      <aside className={styles.tableList}>
        {preview.tables.map((table) => (
          <button
            type="button"
            key={table}
            data-active={preview.selectedTable === table || undefined}
            onClick={() => onSelectTable(table)}
          >
            {table}
          </button>
        ))}
      </aside>
      <div className={styles.tableScroller}>
        <table className={styles.previewTable}>
          <thead>
            <tr>{preview.columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {preview.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {preview.columns.map((column, columnIndex) => (
                  <td key={`${column}-${columnIndex}`}>{row[columnIndex] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Create matching CSS and `index.ts`.

- [ ] **Step 4: Run TypeScript check**

Run:

```bash
cd web
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/domain/WorkbenchImagePreview web/src/components/domain/WorkbenchCsvPreview web/src/components/domain/WorkbenchSqlitePreview
git commit -m "feat: add workbench file previews"
```

## Task 8: File Workspace Component

**Files:**
- Create: `web/src/components/domain/WorkbenchFileWorkspace/WorkbenchFileWorkspace.tsx`
- Create: `web/src/components/domain/WorkbenchFileWorkspace/WorkbenchFileWorkspace.module.css`
- Create: `web/src/components/domain/WorkbenchFileWorkspace/index.ts`

- [ ] **Step 1: Create workspace component**

Create `WorkbenchFileWorkspace.tsx` with props:

```tsx
import type { WorkbenchOpenFile } from '@/lib/types';
import { Button } from '@/components/primitives/Button';
import { useTranslation } from 'react-i18next';
import { WorkbenchCodeEditor } from '../WorkbenchCodeEditor';
import { WorkbenchCsvPreview } from '../WorkbenchCsvPreview';
import { WorkbenchImagePreview } from '../WorkbenchImagePreview';
import { WorkbenchMarkdownEditor } from '../WorkbenchMarkdownEditor';
import { WorkbenchSqlitePreview } from '../WorkbenchSqlitePreview';
import styles from './WorkbenchFileWorkspace.module.css';

export interface WorkbenchOpenFileTab {
  id: string;
  path: string;
  name: string;
  opened: WorkbenchOpenFile;
  content: string;
  dirty: boolean;
  mode: 'viewer' | 'editor' | 'wysiwyg' | 'source' | 'split';
}

export interface WorkbenchFileWorkspaceProps {
  tabs: WorkbenchOpenFileTab[];
  activeTabId: string | null;
  saving: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onReturnToTerminal: () => void;
  onContentChange: (id: string, value: string) => void;
  onModeChange: (id: string, mode: WorkbenchOpenFileTab['mode']) => void;
  onSave: (id: string) => void;
  onFormat: (id: string) => void;
  onSelectSqliteTable: (id: string, table: string) => void;
}

/**
 * Business Logic（为什么需要这个组件）:
 *   文件打开后中央区域应成为文件标签页工作区，但不能销毁后台终端会话。
 *
 * Code Logic（这个组件做什么）:
 *   渲染文件 tab strip、文件工具栏和对应类型的编辑/预览组件。
 */
export function WorkbenchFileWorkspace(props: WorkbenchFileWorkspaceProps): JSX.Element {
  const {
    tabs,
    activeTabId,
    saving,
    onActivate,
    onClose,
    onReturnToTerminal,
    onContentChange,
    onModeChange,
    onSave,
    onFormat,
    onSelectSqliteTable,
  } = props;
  const { t } = useTranslation(['workbench']);
  const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;

  return (
    <section className={styles.fileWorkspace}>
      <div className={styles.fileTabs}>
        {tabs.map((tab) => (
          <button type="button" key={tab.id} data-active={tab.id === active?.id || undefined} onClick={() => onActivate(tab.id)}>
            {tab.name}
            {tab.dirty ? ' *' : ''}
            <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onClose(tab.id); }}>x</span>
          </button>
        ))}
        <Button size="sm" variant="secondary" onClick={onReturnToTerminal}>
          {t('workbench:returnTerminal')}
        </Button>
      </div>
      {active ? (
        <div className={styles.fileBody}>
          <div className={styles.fileToolbar}>
            <strong>{active.name}</strong>
            <span>{active.opened.detectedType}</span>
            {active.opened.capabilities.canFormat ? <Button size="sm" variant="secondary" onClick={() => onFormat(active.id)}>{t('workbench:formatFile')}</Button> : null}
            {active.opened.capabilities.canEdit ? <Button size="sm" variant="primary" loading={saving} disabled={!active.dirty} onClick={() => onSave(active.id)}>{t('workbench:saveFile')}</Button> : null}
          </div>
          <div className={styles.fileContent}>
            {renderFileTab(active, onContentChange, onModeChange, onSelectSqliteTable, t('workbench:filePreviewUnavailable'))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
```

Add `renderFileTab` in same file:

```tsx
function renderFileTab(
  tab: WorkbenchOpenFileTab,
  onContentChange: (id: string, value: string) => void,
  onModeChange: (id: string, mode: WorkbenchOpenFileTab['mode']) => void,
  onSelectSqliteTable: (id: string, table: string) => void,
  previewUnavailable: string,
): JSX.Element {
  switch (tab.opened.detectedType) {
    case 'markdown':
      return (
        <WorkbenchMarkdownEditor
          value={tab.content}
          mode={tab.mode === 'source' || tab.mode === 'split' ? tab.mode : 'wysiwyg'}
          onModeChange={(mode) => onModeChange(tab.id, mode)}
          onChange={(value) => onContentChange(tab.id, value)}
        />
      );
    case 'image':
      return tab.opened.image ? <WorkbenchImagePreview preview={tab.opened.image} name={tab.name} /> : <p>{previewUnavailable}</p>;
    case 'csv':
      return tab.opened.csv ? <WorkbenchCsvPreview preview={tab.opened.csv} /> : <p>{previewUnavailable}</p>;
    case 'sqlite':
      return tab.opened.sqlite ? (
        <WorkbenchSqlitePreview preview={tab.opened.sqlite} onSelectTable={(table) => onSelectSqliteTable(tab.id, table)} />
      ) : (
        <p>{previewUnavailable}</p>
      );
    default:
      return (
        <WorkbenchCodeEditor
          value={tab.content}
          language={tab.opened.detectedType}
          readOnly={!tab.opened.capabilities.canEdit}
          onChange={(value) => onContentChange(tab.id, value)}
        />
      );
  }
}
```

- [ ] **Step 2: Create CSS**

Create `WorkbenchFileWorkspace.module.css`:

```css
.fileWorkspace {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: var(--bg);
}

.fileTabs {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border-bottom: 1px solid var(--border-soft);
  padding: var(--space-2);
  background: var(--surface);
}

.fileTabs button {
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-3);
  background: var(--bg);
  color: var(--fg-2);
  cursor: pointer;
  transition: all var(--motion-fast) var(--ease-standard);
}

.fileTabs button[data-active='true'] {
  background: var(--accent-soft);
  color: var(--fg);
}

.fileBody {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-3);
}

.fileToolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.fileContent {
  min-height: 0;
  overflow: hidden;
}
```

- [ ] **Step 3: Run TypeScript check**

Run:

```bash
cd web
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/domain/WorkbenchFileWorkspace
git commit -m "feat: add workbench file workspace"
```

## Task 9: Integrate File Workspace into Workbench

**Files:**
- Modify: `web/src/pages/Workbench/Workbench.tsx`
- Modify: `web/src/pages/Workbench/Workbench.module.css`
- Modify: `web/src/i18n/locales/zh/workbench.json`
- Modify: `web/src/i18n/locales/en/workbench.json`

- [ ] **Step 1: Add Workbench state**

In `Workbench.tsx`, add state near existing file tree state:

```tsx
const [fileTabs, setFileTabs] = useState<WorkbenchOpenFileTab[]>([]);
const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);
const [workspaceView, setWorkspaceView] = useState<'terminal' | 'files'>('terminal');
const [fileSaving, setFileSaving] = useState<boolean>(false);
```

- [ ] **Step 2: Add open handler**

Add handler:

```tsx
const handleOpenFile = useCallback(
  async (node: WorkbenchFileNode) => {
    if (node.kind !== 'file') return;
    const projectId = activeProjectIdRef.current;
    const worktreeId = activeWorktreeIdRef.current;
    if (!projectId) return;
    try {
      setFileError(null);
      const opened = await workbenchApi.files.open(projectId, node.path, worktreeId);
      if (activeProjectIdRef.current !== projectId || activeWorktreeIdRef.current !== worktreeId) return;
      const id = `${worktreeId ?? 'main'}:${opened.metadata.path}`;
      const nextTab: WorkbenchOpenFileTab = {
        id,
        path: opened.metadata.path,
        name: opened.metadata.name,
        opened,
        content: opened.text?.content ?? '',
        dirty: false,
        mode: opened.detectedType === 'markdown' ? 'wysiwyg' : opened.capabilities.canEdit ? 'editor' : 'viewer',
      };
      setFileTabs((current) => {
        const exists = current.some((tab) => tab.id === id);
        return exists ? current.map((tab) => (tab.id === id ? nextTab : tab)) : [...current, nextTab];
      });
      setActiveFileTabId(id);
      setWorkspaceView('files');
    } catch (error) {
      if (activeProjectIdRef.current !== projectId || activeWorktreeIdRef.current !== worktreeId) return;
      setFileError(displayErrorMessage(error, t('workbench:errors.openFile'), desktopUnavailableMessage));
    }
  },
  [desktopUnavailableMessage, t],
);
```

- [ ] **Step 3: Modify file selection**

In `handleSelectNode`, keep existing metadata behavior and call `handleOpenFile(node)` only for files:

```tsx
const handleSelectNode = useCallback(
  (node: WorkbenchFileNode) => {
    setSelectedPath(node.path);
    void loadPathInfo(node.path);
    if (node.kind === 'file') {
      void handleOpenFile(node);
    }
  },
  [handleOpenFile, loadPathInfo],
);
```

- [ ] **Step 4: Render file workspace without unmounting terminal instances**

Wrap terminal area render so mounted terminal sessions remain in DOM but hidden when `workspaceView === 'files'`. Use CSS classes instead of conditional unmount:

```tsx
<div className={styles.mainWorkspace}>
  <div className={styles.terminalLayer} data-hidden={workspaceView === 'files' || undefined}>
    {/* existing terminal panel and mounted TerminalPane list */}
  </div>
  <div className={styles.fileLayer} data-hidden={workspaceView !== 'files' || undefined}>
    <WorkbenchFileWorkspace
      tabs={fileTabs}
      activeTabId={activeFileTabId}
      saving={fileSaving}
      onActivate={setActiveFileTabId}
      onClose={handleCloseFileTab}
      onReturnToTerminal={() => setWorkspaceView('terminal')}
      onContentChange={handleFileContentChange}
      onModeChange={handleFileModeChange}
      onSave={handleSaveFileTab}
      onFormat={handleFormatFileTab}
      onSelectSqliteTable={handleSelectSqliteTable}
    />
  </div>
</div>
```

- [ ] **Step 5: Add save/format handlers**

Add handlers using `workbenchApi.files.saveText` and `formatStructured`; before save run frontend `validateJsonText` / `validateTomlText`, and on success update `baseHash`, `dirty=false`.

- [ ] **Step 6: Add i18n keys**

Add to `web/src/i18n/locales/zh/workbench.json`:

```json
{
  "returnTerminal": "返回终端",
  "saveFile": "保存",
  "formatFile": "格式化",
  "fileUnsaved": "未保存",
  "fileSaved": "已保存",
  "filePreviewTruncated": "预览已截断",
  "filePreviewUnavailable": "当前文件无法预览",
  "errors": {
    "openFile": "打开文件失败",
    "saveFile": "保存文件失败",
    "formatFile": "格式化失败"
  }
}
```

Add English equivalents.

- [ ] **Step 7: Add CSS for layered workspace**

Add to `Workbench.module.css`:

```css
.mainWorkspace {
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.terminalLayer,
.fileLayer {
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
}

.terminalLayer[data-hidden='true'],
.fileLayer[data-hidden='true'] {
  visibility: hidden;
  pointer-events: none;
}
```

- [ ] **Step 8: Run Workbench tests**

Run:

```bash
cd web
npx --yes tsx src/pages/Workbench/workbenchFiles.test.ts
npx --yes tsx src/pages/Workbench/workbenchWorktrees.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/pages/Workbench/Workbench.tsx web/src/pages/Workbench/Workbench.module.css web/src/i18n/locales/zh/workbench.json web/src/i18n/locales/en/workbench.json
git commit -m "feat: integrate workbench file workspace"
```

## Task 10: Documentation and Memory Updates

**Files:**
- Modify: `docs/prd.md`
- Modify: `AGENTS.md`
- Modify: `web/CLAUDE.md`
- Modify: `src-tauri/CLAUDE.md`

- [ ] **Step 1: Update PRD**

In `docs/prd.md` Workbench section, replace the old “第一期不做文件内容预览...” line with:

```md
- 项目文件夹内容工作区：右侧文件树绑定 active worktree 根目录；点击文件后中央终端区临时切换为文件标签页工作区，terminal window/pane 会话保持后台运行，用户可随时返回终端。第一版支持图片预览、Markdown 所见即所得/源码/拆分编辑、代码高亮编辑、JSON/TOML 格式化与保存前语义校验、CSV 只读表格预览、SQLite schema/table 只读浏览；CSV 单元格编辑、SQLite 写入/SQL 执行、Git diff 面板和交互式冲突解决不进入第一版。
```

- [ ] **Step 2: Update root AGENTS component list**

Add domain rows:

```md
| WorkbenchFileWorkspace | tabs, activeTabId, onSave, onReturnToTerminal | Workbench 中央文件标签页工作区 |
| WorkbenchCodeEditor | value, language, readOnly, onChange | CodeMirror 代码/源码编辑器 |
| WorkbenchMarkdownEditor | value, mode, onModeChange, onChange | Markdown WYSIWYG/源码/拆分编辑器 |
| WorkbenchImagePreview | preview, name | 图片只读预览 |
| WorkbenchCsvPreview | preview | CSV 只读表格预览 |
| WorkbenchSqlitePreview | preview, onSelectTable | SQLite 只读表/字段/行预览 |
```

- [ ] **Step 3: Update `web/CLAUDE.md`**

Add concise Workbench memory:

```md
- **Workbench 文件工作区**: 右侧文件树点击文件后，中央终端区临时切到文件 tab；终端实例必须保留在 DOM 中并隐藏，不能卸载重放。文件工作区由 `WorkbenchFileWorkspace` 组合 CodeMirror/Tiptap/图片/CSV/SQLite 预览组件；CSV 和 SQLite 第一版只读。JSON/TOML 必须前端即时校验并在保存前后端再次校验。相关验证命令：`npx --yes tsx src/pages/Workbench/workbenchFiles.test.ts && npm run build`。
```

- [ ] **Step 4: Update `src-tauri/CLAUDE.md`**

Add concise backend memory:

```md
- **Workbench 文件内容命令**: 文件内容读写继续复用 worktree 根路径安全边界，拒绝越界、绝对路径和外部 symlink。文本保存使用 baseHash 乐观锁和临时文件原子替换；JSON/TOML 保存前后端校验失败必须拒绝落盘。CSV/SQLite 第一版只读预览，SQLite 用 read_only 连接且不执行用户输入 SQL。相关验证命令：`cargo test workbench::file_content --lib && cargo test workbench::file_preview --lib && cargo check`。
```

- [ ] **Step 5: Run final targeted verification**

Run:

```bash
cd src-tauri
cargo test workbench::file_content --lib
cargo test workbench::file_preview --lib
cargo check
cd ../web
npx --yes tsx src/pages/Workbench/workbenchFiles.test.ts
npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit docs**

```bash
git add docs/prd.md AGENTS.md web/CLAUDE.md src-tauri/CLAUDE.md
git commit -m "docs: document workbench file workspace"
```

## Self-Review Checklist

- Spec requirement “B1 文件标签页工作区” maps to Task 8 and Task 9.
- Spec requirement “终端隐藏但不销毁” maps to Task 9 Step 4.
- Spec requirement “代码高亮插件级体验” maps to Task 5.
- Spec requirement “Markdown WYSIWYG/source/split” maps to Task 6.
- Spec requirement “Markdown 保存允许规范化” maps to Task 6 and docs.
- Spec requirement “JSON/TOML 格式化与语义校验” maps to Task 1, Task 2, Task 4, Task 9.
- Spec requirement “CSV 只读” maps to Task 3 and Task 7.
- Spec requirement “SQLite 只读” maps to Task 3 and Task 7.
- Spec requirement “文档/PRD/项目记忆更新” maps to Task 10.
