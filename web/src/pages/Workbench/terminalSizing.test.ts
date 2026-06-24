import { terminalPanePixelSize, terminalViewportPixelSize } from './terminalSizing';

/**
 * Business Logic（为什么需要这个函数）:
 *   工作台终端的行列数必须按用户实际可见内容区计算，不能把终端外框的 inset 当成可绘制宽度。
 *
 * Code Logic（这个函数做什么）:
 *   对比像素尺寸对象；不一致时抛错让脚本以非零状态退出。
 */
function assertSize(
  actual: { width: number; height: number },
  expected: { width: number; height: number },
): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

assertSize(
  terminalPanePixelSize({
    panelWidth: 1000,
    panelHeight: 500,
    layout: 'single',
    headerHeight: 36,
  }),
  { width: 1000, height: 464 },
);

assertSize(
  terminalViewportPixelSize({
    panelWidth: 1000,
    panelHeight: 500,
    layout: 'single',
    headerHeight: 36,
    viewportInsetX: 12,
    viewportInsetY: 12,
  }),
  { width: 976, height: 440 },
);

assertSize(
  terminalViewportPixelSize({
    panelWidth: 1001,
    panelHeight: 500,
    layout: 'double',
    headerHeight: 36,
    viewportInsetX: 12,
    viewportInsetY: 12,
  }),
  { width: 476, height: 440 },
);

assertSize(
  terminalViewportPixelSize({
    panelWidth: 1001,
    panelHeight: 701,
    layout: 'quad',
    headerHeight: 36,
    viewportInsetX: 12,
    viewportInsetY: 12,
  }),
  { width: 476, height: 290 },
);

console.log('terminalSizing.test.ts passed');
