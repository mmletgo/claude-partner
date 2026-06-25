import {
  detectWorkbenchFileType,
  fileCapabilitiesForType,
  reduceFileTabs,
  validateJsonText,
  validateTomlText,
} from './workbenchFiles';

/**
 * Business Logic（为什么需要这个函数）:
 *   Workbench 文件工作区 helper 采用轻量脚本测试，需要在没有测试框架时也能快速表达失败原因。
 *
 * Code Logic（这个函数做什么）:
 *   接收布尔条件和失败消息；条件为 false 时抛出 Error 让 tsx 进程以失败状态退出。
 */
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/**
 * Business Logic（为什么需要这个函数）:
 *   文件工作区第一版需要统一覆盖文件类型识别、能力映射、tab 状态切换和保存前校验。
 *
 * Code Logic（这个函数做什么）:
 *   顺序调用 Workbench 文件 helper，断言关键行为符合设计规格。
 */
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
    {
      type: 'opened',
      tab: {
        id: 'readme',
        path: 'README.md',
        name: 'README.md',
        detectedType: 'markdown',
        mode: 'wysiwyg',
        dirty: false,
      },
    },
  );
  assert(tabs.activeTabId === 'readme', 'opened tab becomes active');
  assert(tabs.view === 'files', 'opening file switches to files view');

  assert(validateJsonText('{"ok":true}').ok, 'valid json accepted');
  assert(!validateJsonText('{bad').ok, 'invalid json rejected');
  assert(validateTomlText('title = "cc-partner"').ok, 'valid toml accepted');
  assert(!validateTomlText('title = ').ok, 'invalid toml rejected');
}

void main();
