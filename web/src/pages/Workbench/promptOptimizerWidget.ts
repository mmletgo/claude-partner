/**
 * Workbench Prompt 优化小组件状态 helper。
 *
 * Business Logic（为什么需要这个模块）:
 *   Workbench 内嵌 Prompt 优化后，需要把优化结果安全填入当前活动终端；
 *   选择填入文本、按钮可用性和写入 payload 必须独立测试，避免 UI 改动破坏终端输入规则。
 *
 * Code Logic（这个模块做什么）:
 *   提供无 React 依赖的纯函数：中文结果优先、英文结果兜底、仅 running session 可填入，
 *   打开时清空可见文本，并保持写入文本原样，不主动追加 Enter。
 */

import type {
  PromptOptimizeResponse,
  PromptOptimizerFillLanguage,
  WorkbenchProject,
  WorkbenchSession,
} from '../../lib/types';

export interface PromptOptimizerShortcutEvent {
  type: 'keydown' | 'keyup';
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
}

export interface PromptOptimizerShortcutState {
  pendingModifier: string | null;
  chorded: boolean;
}

export interface PromptOptimizerShortcutResult {
  state: PromptOptimizerShortcutState;
  triggered: boolean;
}

export interface PromptOptimizerTextState {
  input: string;
  result: PromptOptimizeResponse;
  message: string | null;
}

const MODIFIER_SHORTCUT_BY_KEY: Record<string, string> = {
  Alt: '<alt>',
  AltGraph: '<alt>',
  Control: '<ctrl>',
  Meta: '<cmd>',
  OS: '<cmd>',
  Shift: '<shift>',
  Super: '<cmd>',
};

const SPECIAL_KEY_BY_KEY: Record<string, string> = {
  ArrowDown: '<down>',
  ArrowLeft: '<left>',
  ArrowRight: '<right>',
  ArrowUp: '<up>',
  Enter: '<enter>',
  Home: '<home>',
  End: '<end>',
  PageDown: '<page_down>',
  PageUp: '<page_up>',
  Tab: '<tab>',
};

/**
 * Business Logic（为什么需要这个函数）:
 *   Prompt 优化小组件每次重新打开都应是干净输入态，不能残留上一次输入或结果。
 *
 * Code Logic（这个函数做什么）:
 *   返回空的 PromptOptimizeResponse，供 React state 初始化和重新打开时复用。
 */
export function createEmptyPromptOptimizeResponse(): PromptOptimizeResponse {
  return {
    optimizedZh: '',
    optimizedEn: '',
  };
}

/**
 * Business Logic（为什么需要这个函数）:
 *   用户关闭再打开 Workbench Prompt 优化浮层时，所有可见文本都必须清空。
 *
 * Code Logic（这个函数做什么）:
 *   忽略传入的旧状态，返回空输入、空中英文结果和空状态消息。
 */
export function resetPromptOptimizerTextState(
  _state?: PromptOptimizerTextState,
): PromptOptimizerTextState {
  return {
    input: '',
    result: createEmptyPromptOptimizeResponse(),
    message: null,
  };
}

/**
 * Business Logic（为什么需要这个函数）:
 *   Workbench 需要区分“轻按 Control”与“Control+C”等终端组合键，避免默认快捷键破坏终端操作。
 *
 * Code Logic（这个函数做什么）:
 *   返回快捷键状态机初始值；pendingModifier 记录正在等待 keyup 的单修饰键。
 */
export function createPromptOptimizerShortcutState(): PromptOptimizerShortcutState {
  return {
    pendingModifier: null,
    chorded: false,
  };
}

/**
 * Business Logic（为什么需要这个函数）:
 *   Workbench Prompt 优化快捷键支持组合键，也支持用户指定的 Control 单键。
 *
 * Code Logic（这个函数做什么）:
 *   把键盘事件转换为 `<ctrl>+p` 这类持久化格式；无法表达的键返回空字符串。
 */
function shortcutValueFromEvent(event: PromptOptimizerShortcutEvent): string {
  const modifierOnly = MODIFIER_SHORTCUT_BY_KEY[event.key];
  if (modifierOnly) return modifierOnly;

  let key = '';
  if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space') {
    key = '<space>';
  } else if (/^F\d{1,2}$/i.test(event.key)) {
    key = event.key.toLowerCase();
  } else if (event.key.length === 1) {
    key = event.key.toLowerCase();
  } else {
    key = SPECIAL_KEY_BY_KEY[event.key] ?? '';
  }
  if (!key) return '';

  const parts: string[] = [];
  if (event.metaKey) parts.push('<cmd>');
  if (event.ctrlKey) parts.push('<ctrl>');
  if (event.altKey) parts.push('<alt>');
  if (event.shiftKey) parts.push('<shift>');
  parts.push(key);
  return parts.join('+');
}

/**
 * Business Logic（为什么需要这个函数）:
 *   默认快捷键是 Control 单键，但 Control 也常用于终端组合键；必须只在“单独按下并释放”
 *   时触发，不能拦截 Ctrl+C/Ctrl+D 等工作流。
 *
 * Code Logic（这个函数做什么）:
 *   组合键在 keydown 即触发；单修饰键在 keydown 进入 pending，期间若出现其他 keydown 标记为 chorded，
 *   只有对应 keyup 且未 chorded 才触发。
 */
export function reducePromptOptimizerShortcut(
  state: PromptOptimizerShortcutState,
  event: PromptOptimizerShortcutEvent,
  shortcut: string,
): PromptOptimizerShortcutResult {
  const normalizedShortcut = shortcut.trim().toLowerCase();
  if (!normalizedShortcut) {
    return { state: createPromptOptimizerShortcutState(), triggered: false };
  }

  const modifierShortcut = MODIFIER_SHORTCUT_BY_KEY[event.key];
  const isModifierOnlyShortcut = normalizedShortcut === modifierShortcut;

  if (event.type === 'keydown') {
    if (event.repeat) return { state, triggered: false };
    if (isModifierOnlyShortcut) {
      return {
        state: { pendingModifier: normalizedShortcut, chorded: false },
        triggered: false,
      };
    }
    if (state.pendingModifier) {
      return {
        state: { ...state, chorded: true },
        triggered: false,
      };
    }
    return {
      state,
      triggered: shortcutValueFromEvent(event).toLowerCase() === normalizedShortcut,
    };
  }

  if (state.pendingModifier && normalizedShortcut === state.pendingModifier) {
    const triggered = !state.chorded && modifierShortcut === normalizedShortcut;
    return {
      state: createPromptOptimizerShortcutState(),
      triggered,
    };
  }

  return { state, triggered: false };
}

/**
 * Business Logic（为什么需要这个函数）:
 *   用户点击“一键填入终端”时默认应使用中文优化结果；中文为空时仍可使用英文结果。
 *
 * Code Logic（这个函数做什么）:
 *   接收优化结果 DTO，先 trim 检查中文结果是否有内容，有则返回原始中文字符串；
 *   否则检查英文结果并返回原始英文字符串；两者都为空时返回空字符串。
 */
export function selectPromptOptimizerInsertText(
  result: PromptOptimizeResponse,
  preferredLanguage: PromptOptimizerFillLanguage = 'zh',
): string {
  const primary = preferredLanguage === 'en' ? result.optimizedEn : result.optimizedZh;
  const fallback = preferredLanguage === 'en' ? result.optimizedZh : result.optimizedEn;
  if (primary.trim().length > 0) return primary;
  if (fallback.trim().length > 0) return fallback;
  return '';
}

/**
 * Business Logic（为什么需要这个函数）:
 *   只有当前活动终端真实运行时，填入按钮才应可用，避免写入已退出或不存在的 session。
 *
 * Code Logic（这个函数做什么）:
 *   检查 activeSession 是否存在且 status 为 running。
 */
export function canFillPromptIntoTerminal(activeSession: WorkbenchSession | null): boolean {
  return activeSession?.status === 'running';
}

/**
 * Business Logic（为什么需要这个函数）:
 *   Workbench 中优化 prompt 时应让 Claude Code 获得当前项目 CLAUDE.md 上下文。
 *
 * Code Logic（这个函数做什么）:
 *   从当前活动项目 DTO 取绝对路径；项目缺失或路径为空时返回 undefined。
 */
export function promptOptimizerWorkingDirectory(
  activeProject: WorkbenchProject | null,
): string | undefined {
  const path = activeProject?.path.trim();
  return path ? path : undefined;
}

/**
 * Business Logic（为什么需要这个函数）:
 *   Workbench 填入终端只应插入文本，不应代替用户执行命令。
 *
 * Code Logic（这个函数做什么）:
 *   复用结果选择规则并原样返回待写入 PTY 的 payload，不追加回车；
 *   若原优化结果本身包含换行，则完整保留。
 */
export function promptOptimizerInsertPayload(
  result: PromptOptimizeResponse,
  preferredLanguage: PromptOptimizerFillLanguage = 'zh',
): string {
  return selectPromptOptimizerInsertText(result, preferredLanguage);
}
