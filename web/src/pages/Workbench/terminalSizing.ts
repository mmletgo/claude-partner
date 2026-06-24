export type TerminalLayoutMode = 'single' | 'double' | 'quad';

interface TerminalPanePixelSizeInput {
  panelWidth: number;
  panelHeight: number;
  layout: TerminalLayoutMode;
  headerHeight: number;
}

interface TerminalViewportPixelSizeInput extends TerminalPanePixelSizeInput {
  viewportInsetX: number;
  viewportInsetY: number;
}

interface TerminalPixelSize {
  width: number;
  height: number;
}

/**
 * Business Logic（为什么需要这个函数）:
 *   创建或重启工作台终端前，需要按当前工作台布局预估单个 pane 的外框尺寸。
 *
 * Code Logic（这个函数做什么）:
 *   根据 single/double/quad 布局拆分 panel 宽高，并扣除每个 pane 顶部 header 高度。
 */
export function terminalPanePixelSize(input: TerminalPanePixelSizeInput): TerminalPixelSize {
  const paneColumns = input.layout === 'single' ? 1 : 2;
  const paneRows = input.layout === 'quad' ? 2 : 1;
  const paneWidth = Math.floor(Math.max(0, input.panelWidth) / paneColumns);
  const paneHeight = Math.floor(Math.max(0, input.panelHeight) / paneRows);
  return {
    width: paneWidth,
    height: Math.max(0, paneHeight - input.headerHeight),
  };
}

/**
 * Business Logic（为什么需要这个函数）:
 *   终端内容区存在视觉 inset，xterm 行列数必须基于用户实际可见内容区，而不是 pane 外框。
 *
 * Code Logic（这个函数做什么）:
 *   在 pane 外框尺寸基础上扣除左右/上下 inset，返回 xterm 可绘制 viewport 像素尺寸。
 */
export function terminalViewportPixelSize(input: TerminalViewportPixelSizeInput): TerminalPixelSize {
  const paneSize = terminalPanePixelSize(input);
  return {
    width: Math.max(0, paneSize.width - input.viewportInsetX * 2),
    height: Math.max(0, paneSize.height - input.viewportInsetY * 2),
  };
}
