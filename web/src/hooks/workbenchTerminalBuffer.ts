export type WorkbenchTerminalBuffers = Record<string, string>;

export const MAX_WORKBENCH_TERMINAL_BUFFER_CHARS = 200_000;

/**
 * Business Logic（为什么需要这个函数）:
 *   Workbench 页面切出后，常驻终端 Provider 仍要持续缓存 PTY/tmux 输出，切回时 xterm 可 replay。
 *
 * Code Logic（这个函数做什么）:
 *   将指定 session 的输出追加到 buffer，并只保留末尾 maxChars 个字符，避免内存无限增长。
 */
export function appendWorkbenchTerminalOutput(
  buffers: WorkbenchTerminalBuffers,
  sessionId: string,
  chunk: string,
  maxChars = MAX_WORKBENCH_TERMINAL_BUFFER_CHARS,
): WorkbenchTerminalBuffers {
  const nextBuffer = `${buffers[sessionId] ?? ''}${chunk}`;
  return {
    ...buffers,
    [sessionId]: nextBuffer.length > maxChars ? nextBuffer.slice(-maxChars) : nextBuffer,
  };
}

/**
 * Business Logic（为什么需要这个函数）:
 *   新建 terminal window 后应从空屏幕开始 replay，避免复用同 id 的旧输出残留。
 *
 * Code Logic（这个函数做什么）:
 *   返回浅拷贝对象，并把指定 session buffer 置为空字符串。
 */
export function resetWorkbenchTerminalBuffer(
  buffers: WorkbenchTerminalBuffers,
  sessionId: string,
): WorkbenchTerminalBuffers {
  return {
    ...buffers,
    [sessionId]: '',
  };
}

/**
 * Business Logic（为什么需要这个函数）:
 *   用户关闭 terminal window 后，对应输出缓存不应继续占用内存或在未来误 replay。
 *
 * Code Logic（这个函数做什么）:
 *   从浅拷贝对象中删除指定 session buffer。
 */
export function removeWorkbenchTerminalBuffer(
  buffers: WorkbenchTerminalBuffers,
  sessionId: string,
): WorkbenchTerminalBuffers {
  const next = { ...buffers };
  delete next[sessionId];
  return next;
}
