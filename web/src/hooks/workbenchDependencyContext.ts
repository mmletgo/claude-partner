/**
 * Workbench dependency Context 定义与读取 hook。
 *
 * Business Logic（为什么需要这个模块）:
 *   Workbench 页面和 Settings 诊断入口都需要共享同一份 tmux 依赖状态。
 *
 * Code Logic（这个模块做什么）:
 *   定义 Context value、创建 React Context，并提供 useWorkbenchDependency 读取上下文。
 */

import { createContext, useContext } from 'react';
import type { WorkbenchDependencyStatus } from '@/lib/types';

export interface WorkbenchDependencyContextValue {
  status: WorkbenchDependencyStatus;
  checking: boolean;
  installing: boolean;
  error: string | null;
  check: () => Promise<void>;
  install: () => Promise<void>;
  cancel: () => Promise<void>;
}

export const WorkbenchDependencyContext =
  createContext<WorkbenchDependencyContextValue | null>(null);

/**
 * Business Logic（为什么需要这个函数）:
 *   多个页面需要访问 Workbench 依赖状态，缺少 Provider 时应明确报错。
 *
 * Code Logic（这个函数做什么）:
 *   从 React Context 读取 value；缺失时抛出可诊断错误。
 */
export function useWorkbenchDependency(): WorkbenchDependencyContextValue {
  const value = useContext(WorkbenchDependencyContext);
  if (!value) {
    throw new Error('useWorkbenchDependency must be used inside WorkbenchDependencyProvider');
  }
  return value;
}
