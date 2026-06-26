// node:fs 类型由 @types/node 提供,但本仓库 tsconfig 未在 compilerOptions.types 显式纳入 node,
// tsx 测试上下文下类型缺失,故局部抑制(运行时 tsx 正常解析;node:fs 是 node 内置,无需安装)。
// @ts-expect-error - 本仓库 tsconfig 未在 compilerOptions.types 纳入 node,node:fs 类型缺失,运行时 tsx 正常
import { readFileSync } from 'node:fs';

/**
 * Business Logic（为什么需要这个函数）:
 *   Workbench 深色代码编辑器需要稳定使用 One Dark Pro 语义色，避免 JSON/TOML 高亮回退到不协调默认色。
 *
 * Code Logic（这个函数做什么）:
 *   检查源码是否包含 One Dark Pro 核心色值、CodeMirror theme/highlight 扩展和语义 token 绑定。
 */
function assertContains(source: string, expected: string, message: string): void {
  if (!source.includes(expected)) {
    throw new Error(message);
  }
}

/**
 * Business Logic（为什么需要这个函数）:
 *   CSS Modules 只负责编辑器尺寸和外框，不能覆盖 CodeMirror 内部主题色，否则 One Dark Pro 高亮会失效。
 *
 * Code Logic（这个函数做什么）:
 *   读取组件和 CSS 源码，断言主题扩展被注入，同时 CSS 不再声明 `.cm-gutters`/`.cm-activeLine` 颜色覆盖。
 */
async function main(): Promise<void> {
  const editorSource = readFileSync(new URL('./WorkbenchCodeEditor.tsx', import.meta.url), 'utf8');
  const themeSource = readFileSync(new URL('./workbenchCodeEditorTheme.ts', import.meta.url), 'utf8');
  const cssSource = readFileSync(new URL('./WorkbenchCodeEditor.module.css', import.meta.url), 'utf8');

  assertContains(themeSource, "background: '#282c34'", 'One Dark Pro editor background is configured');
  assertContains(themeSource, "foreground: '#abb2bf'", 'One Dark Pro foreground is configured');
  assertContains(themeSource, "keyword: '#c678dd'", 'One Dark Pro keyword color is configured');
  assertContains(themeSource, "string: '#98c379'", 'One Dark Pro string color is configured');
  assertContains(themeSource, "number: '#d19a66'", 'One Dark Pro number color is configured');
  assertContains(themeSource, "property: '#e06c75'", 'One Dark Pro property color is configured');
  assertContains(themeSource, "function: '#61afef'", 'One Dark Pro function color is configured');
  assertContains(themeSource, 'syntaxHighlighting(WORKBENCH_ONE_DARK_PRO_HIGHLIGHT)', 'CodeMirror syntax highlighting extension is exported');
  assertContains(editorSource, 'WORKBENCH_ONE_DARK_PRO_EXTENSION', 'One Dark Pro extension is injected into the editor');

  if (cssSource.includes('.cm-gutters') || cssSource.includes('.cm-activeLine')) {
    throw new Error('CodeMirror internal color selectors should be owned by the One Dark Pro theme extension');
  }
}

void main();
