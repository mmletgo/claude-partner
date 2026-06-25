/**
 * Workbench 依赖 API - 通过 Tauri invoke 管理 tmux 检测、安装和重新检测。
 *
 * Business Logic（为什么需要这个模块）:
 *   Workbench 的真实 window/pane 体验依赖 tmux，前端需要统一调用后端 dependency manager。
 *
 * Code Logic（这个模块做什么）:
 *   封装 check/install/status/cancel 四个命令；组件层只消费类型化 Promise。
 */

import { invoke } from './client';
import type { WorkbenchDependencyStatus } from '@/lib/types';

export const workbenchDependencyApi = {
  /** 检测 tmux 是否可用。 */
  check: () => invoke<WorkbenchDependencyStatus>('check_workbench_dependency'),

  /** 启动 tmux 安装流程。 */
  install: () => invoke<WorkbenchDependencyStatus>('install_workbench_dependency'),

  /** 读取当前安装/检测状态。 */
  status: () => invoke<WorkbenchDependencyStatus>('get_workbench_dependency_install_status'),

  /** 取消正在进行的安装流程。 */
  cancel: () => invoke<WorkbenchDependencyStatus>('cancel_workbench_dependency_install'),
};
