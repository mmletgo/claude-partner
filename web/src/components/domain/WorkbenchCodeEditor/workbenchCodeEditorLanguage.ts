import type { Extension } from '@codemirror/state';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { toml } from '@codemirror/legacy-modes/mode/toml';

/**
 * 计算 Workbench CodeMirror 语言扩展
 *
 * Business Logic（为什么需要这个函数）:
 *   工作台文件面板会接收来自文件类型识别逻辑的语言名称或扩展名，编辑器需要把这些业务语言标识
 *   转换成 CodeMirror 可理解的语法扩展；未识别语言仍应可打开为纯文本，不能阻断文件查看流程。
 *
 * Code Logic（这个函数做什么）:
 *   标准化传入的 language 字符串，按常见语言 ID / 文件扩展名返回对应的 CodeMirror Extension 数组；
 *   TS/TSX/JS/JSX 复用 javascript 扩展配置，TOML 和 shell 通过 legacy stream mode 包装，未知语言返回 []。
 */
export function getWorkbenchCodeEditorLanguageExtensions(language: string): Extension[] {
  const normalizedLanguage = language.trim().toLowerCase().replace(/^\./, '');

  switch (normalizedLanguage) {
    case 'typescript':
    case 'ts':
      return [javascript({ typescript: true })];
    case 'tsx':
      return [javascript({ typescript: true, jsx: true })];
    case 'javascript':
    case 'js':
    case 'mjs':
    case 'cjs':
      return [javascript()];
    case 'jsx':
      return [javascript({ jsx: true })];
    case 'json':
      return [json()];
    case 'yaml':
    case 'yml':
      return [yaml()];
    case 'markdown':
    case 'md':
    case 'mdx':
      return [markdown()];
    case 'css':
      return [css()];
    case 'html':
    case 'htm':
      return [html()];
    case 'python':
    case 'py':
      return [python()];
    case 'rust':
    case 'rs':
      return [rust()];
    case 'toml':
      return [StreamLanguage.define(toml)];
    case 'shell':
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
      return [StreamLanguage.define(shell)];
    default:
      return [];
  }
}
