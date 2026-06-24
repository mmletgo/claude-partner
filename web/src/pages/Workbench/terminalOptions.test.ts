import { workbenchTerminalOptions } from './terminalOptions';

/**
 * Business Logic（为什么需要这个函数）:
 *   tmux attach 输出是完整 PTY 字节流，前端不能额外改写换行，否则 split 后的整屏重绘会错位。
 *
 * Code Logic（这个函数做什么）:
 *   用稳定 token stub 构造 xterm options，并断言 convertEol 保持关闭。
 */
function assertConvertEolDisabled(): void {
  const options = workbenchTerminalOptions(() => 'token');
  if (options.convertEol === true) {
    throw new Error('Workbench terminal must not enable convertEol for PTY/tmux output');
  }
}

assertConvertEolDisabled();

console.log('terminalOptions.test.ts passed');
