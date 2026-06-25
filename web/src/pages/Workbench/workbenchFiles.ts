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
  defaultMode: WorkbenchFileMode;
}

export interface WorkbenchFileTab {
  id: string;
  path: string;
  name: string;
  detectedType: WorkbenchDetectedFileType;
  mode: WorkbenchFileMode;
  dirty: boolean;
}

export type WorkbenchFileWorkspaceView = 'terminal' | 'files';

export interface WorkbenchFileTabsState {
  tabs: WorkbenchFileTab[];
  activeTabId: string | null;
  view: WorkbenchFileWorkspaceView;
}

export type WorkbenchFileTabsAction =
  | { type: 'opened'; tab: WorkbenchFileTab }
  | { type: 'activated'; id: string }
  | { type: 'closed'; id: string }
  | { type: 'modeChanged'; id: string; mode: WorkbenchFileMode }
  | { type: 'dirtyChanged'; id: string; dirty: boolean }
  | { type: 'viewChanged'; view: WorkbenchFileWorkspaceView };

export interface ValidationResult {
  ok: boolean;
  message: string | null;
}

const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
const MARKDOWN_EXTENSIONS = new Set(['markdown', 'md', 'mdown', 'mkd']);
const JSON_EXTENSIONS = new Set(['json', 'jsonc']);
const TOML_EXTENSIONS = new Set(['toml']);
const CSV_EXTENSIONS = new Set(['csv', 'tsv']);
const SQLITE_EXTENSIONS = new Set(['db', 'sqlite', 'sqlite3']);
const TEXT_EXTENSIONS = new Set(['env', 'gitignore', 'log', 'txt']);
const CODE_EXTENSIONS = new Set([
  'bash',
  'c',
  'cc',
  'cpp',
  'cs',
  'css',
  'go',
  'h',
  'hpp',
  'html',
  'htm',
  'java',
  'js',
  'jsx',
  'kt',
  'kts',
  'less',
  'lua',
  'php',
  'py',
  'rb',
  'rs',
  'sass',
  'scala',
  'scss',
  'sh',
  'sql',
  'svelte',
  'swift',
  'ts',
  'tsx',
  'vue',
  'xml',
  'yaml',
  'yml',
  'zsh',
]);

const FILE_CAPABILITIES: Record<WorkbenchDetectedFileType, WorkbenchFileCapabilities> = {
  image: {
    canPreview: true,
    canEdit: false,
    canFormat: false,
    mustValidateBeforeSave: false,
    defaultMode: 'viewer',
  },
  markdown: {
    canPreview: true,
    canEdit: true,
    canFormat: false,
    mustValidateBeforeSave: false,
    defaultMode: 'wysiwyg',
  },
  code: {
    canPreview: true,
    canEdit: true,
    canFormat: false,
    mustValidateBeforeSave: false,
    defaultMode: 'editor',
  },
  json: {
    canPreview: true,
    canEdit: true,
    canFormat: true,
    mustValidateBeforeSave: true,
    defaultMode: 'editor',
  },
  toml: {
    canPreview: true,
    canEdit: true,
    canFormat: true,
    mustValidateBeforeSave: true,
    defaultMode: 'editor',
  },
  csv: {
    canPreview: true,
    canEdit: false,
    canFormat: false,
    mustValidateBeforeSave: false,
    defaultMode: 'viewer',
  },
  sqlite: {
    canPreview: true,
    canEdit: false,
    canFormat: false,
    mustValidateBeforeSave: false,
    defaultMode: 'viewer',
  },
  text: {
    canPreview: true,
    canEdit: true,
    canFormat: false,
    mustValidateBeforeSave: false,
    defaultMode: 'editor',
  },
  binary: {
    canPreview: false,
    canEdit: false,
    canFormat: false,
    mustValidateBeforeSave: false,
    defaultMode: 'viewer',
  },
  unsupported: {
    canPreview: false,
    canEdit: false,
    canFormat: false,
    mustValidateBeforeSave: false,
    defaultMode: 'viewer',
  },
};

/**
 * Business Logic（为什么需要这个函数）:
 *   Workbench 文件树会传入项目相对路径，文件查看器需要用稳定扩展名判断打开方式。
 *
 * Code Logic（这个函数做什么）:
 *   从路径最后一段提取小写扩展名；无扩展名时兼容 `.env` / `.gitignore` 这类点文件名。
 */
function extensionFromFilename(filename: string): string | null {
  const normalizedName = filename.trim().split(/[\\/]/).pop()?.toLowerCase() ?? '';
  if (!normalizedName) return null;
  const lastDotIndex = normalizedName.lastIndexOf('.');
  if (lastDotIndex === -1) return normalizedName;
  if (lastDotIndex === 0 && normalizedName.indexOf('.', 1) === -1) {
    return normalizedName.slice(1);
  }
  const extension = normalizedName.slice(lastDotIndex + 1);
  return extension.length > 0 ? extension : null;
}

/**
 * Business Logic（为什么需要这个函数）:
 *   后端和系统文件信息返回的 mime 可能带 charset，前端需要先归一化再参与能力判断。
 *
 * Code Logic（这个函数做什么）:
 *   去掉 mime 参数并转小写；空字符串返回 null。
 */
function normalizeMime(mime: string | null): string | null {
  if (!mime) return null;
  const normalizedMime = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return normalizedMime.length > 0 ? normalizedMime : null;
}

/**
 * Business Logic（为什么需要这个函数）:
 *   文件查看器打开文件前必须知道应使用图片预览、Markdown 编辑器、代码编辑器还是只读预览。
 *
 * Code Logic（这个函数做什么）:
 *   先按扩展名识别项目常见文件；扩展名缺失时用 mime 兜底判断文本、图片和二进制类型。
 */
export function detectWorkbenchFileType(filename: string, mime: string | null): WorkbenchDetectedFileType {
  const extension = extensionFromFilename(filename);
  if (extension && IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (extension && MARKDOWN_EXTENSIONS.has(extension)) return 'markdown';
  if (extension && JSON_EXTENSIONS.has(extension)) return 'json';
  if (extension && TOML_EXTENSIONS.has(extension)) return 'toml';
  if (extension && CSV_EXTENSIONS.has(extension)) return 'csv';
  if (extension && SQLITE_EXTENSIONS.has(extension)) return 'sqlite';
  if (extension && CODE_EXTENSIONS.has(extension)) return 'code';
  if (extension && TEXT_EXTENSIONS.has(extension)) return 'text';

  const normalizedMime = normalizeMime(mime);
  if (!normalizedMime) return 'unsupported';
  if (normalizedMime.startsWith('image/')) return 'image';
  if (normalizedMime === 'application/json' || normalizedMime.endsWith('+json')) return 'json';
  if (normalizedMime === 'application/toml' || normalizedMime === 'text/toml') return 'toml';
  if (normalizedMime === 'text/csv' || normalizedMime === 'text/tab-separated-values') return 'csv';
  if (normalizedMime === 'application/vnd.sqlite3' || normalizedMime === 'application/x-sqlite3') return 'sqlite';
  if (normalizedMime === 'application/octet-stream') return 'binary';
  if (normalizedMime.startsWith('text/')) return 'text';
  return 'unsupported';
}

/**
 * Business Logic（为什么需要这个函数）:
 *   Workbench 文件 tab 需要基于文件类型统一决定是否允许编辑、预览、格式化和保存前校验。
 *
 * Code Logic（这个函数做什么）:
 *   返回文件类型对应的能力对象，调用方据此选择 viewer/editor/formatter/validator。
 */
export function fileCapabilitiesForType(type: WorkbenchDetectedFileType): WorkbenchFileCapabilities {
  return FILE_CAPABILITIES[type];
}

/**
 * Business Logic（为什么需要这个函数）:
 *   打开文件后 Workbench 需要把文件 tab 激活，并从终端视图切到文件工作区。
 *
 * Code Logic（这个函数做什么）:
 *   按 action 纯函数更新 tabs、activeTabId、view；重复打开同一 tab 时替换旧 tab 并置为 active。
 */
export function reduceFileTabs(
  state: WorkbenchFileTabsState,
  action: WorkbenchFileTabsAction,
): WorkbenchFileTabsState {
  switch (action.type) {
    case 'opened': {
      const nextTabs = state.tabs.some((tab) => tab.id === action.tab.id)
        ? state.tabs.map((tab) => (tab.id === action.tab.id ? action.tab : tab))
        : [...state.tabs, action.tab];
      return { tabs: nextTabs, activeTabId: action.tab.id, view: 'files' };
    }
    case 'activated': {
      if (!state.tabs.some((tab) => tab.id === action.id)) return state;
      return { ...state, activeTabId: action.id, view: 'files' };
    }
    case 'closed': {
      const nextTabs = state.tabs.filter((tab) => tab.id !== action.id);
      if (state.activeTabId !== action.id) return { ...state, tabs: nextTabs };
      const nextActiveTabId = nextTabs.at(-1)?.id ?? null;
      return { tabs: nextTabs, activeTabId: nextActiveTabId, view: nextActiveTabId ? 'files' : 'terminal' };
    }
    case 'modeChanged': {
      return {
        ...state,
        tabs: state.tabs.map((tab) => (tab.id === action.id ? { ...tab, mode: action.mode } : tab)),
      };
    }
    case 'dirtyChanged': {
      return {
        ...state,
        tabs: state.tabs.map((tab) => (tab.id === action.id ? { ...tab, dirty: action.dirty } : tab)),
      };
    }
    case 'viewChanged':
      return { ...state, view: action.view };
  }
}

/**
 * Business Logic（为什么需要这个函数）:
 *   JSON 文件保存前必须阻止语法错误写回磁盘，避免破坏配置或数据文件。
 *
 * Code Logic（这个函数做什么）:
 *   使用原生 JSON.parse 做语义校验；成功返回 ok，失败返回错误消息。
 */
export function validateJsonText(text: string): ValidationResult {
  try {
    JSON.parse(text);
    return { ok: true, message: null };
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}

/**
 * Business Logic（为什么需要这个函数）:
 *   TOML 文件保存前必须阻止语法错误写回磁盘，避免破坏项目配置文件。
 *
 * Code Logic（这个函数做什么）:
 *   使用 smol-toml 的 parse 做语义校验；成功返回 ok，失败返回错误消息。
 */
export function validateTomlText(text: string): ValidationResult {
  try {
    parseToml(text);
    return { ok: true, message: null };
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : 'Invalid TOML' };
  }
}
