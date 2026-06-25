/**
 * Workbench 终端输出缓存 Context 定义与读取 hook。
 *
 * Business Logic（为什么需要这个模块）:
 *   Workbench 页面切换到其他路由后会卸载，但 PTY/tmux 仍在运行；终端输出缓存必须跨路由保留。
 *
 * Code Logic（这个模块做什么）:
 *   定义 Context value、创建 React Context，并提供 useWorkbenchTerminalBuffers 读取上下文。
 */

import { createContext, useContext } from 'react';
import type { WorkbenchTerminalBuffers } from './workbenchTerminalBuffer';

export interface WorkbenchTerminalBuffersContextValue {
  buffers: WorkbenchTerminalBuffers;
  revision: number;
  resetBuffer: (sessionId: string) => void;
  removeBuffer: (sessionId: string) => void;
}

export const WorkbenchTerminalBuffersContext =
  createContext<WorkbenchTerminalBuffersContextValue | null>(null);

/**
 * Business Logic（为什么需要这个函数）:
 *   Workbench 页面需要读取跨路由保留的终端输出缓存。
 *
 * Code Logic（这个函数做什么）:
 *   从 React Context 读取 value；缺少 Provider 时抛出明确错误。
 */
export function useWorkbenchTerminalBuffers(): WorkbenchTerminalBuffersContextValue {
  const value = useContext(WorkbenchTerminalBuffersContext);
  if (!value) {
    throw new Error(
      'useWorkbenchTerminalBuffers must be used inside WorkbenchTerminalBuffersProvider',
    );
  }
  return value;
}
