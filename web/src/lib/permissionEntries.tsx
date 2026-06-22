/**
 * permissionEntries - 权限状态 → 展示条目的共享映射
 *
 * Business Logic（为什么需要这个模块）:
 *   Welcome 引导页与设置页的「权限管理」都需要把后端 PermissionsStatus 渲染成
 *   「图标 + 标题 + 说明 + 授权状态」的标准条目。把映射逻辑收敛到一处，避免两个页面
 *   各写一份重复的 screenCapture/inputMonitoring 构造（规则 9 复用）。
 *
 * Code Logic（这个模块做什么）:
 *   `mapPermissions(status, t)` 接收 welcome ns 的翻译函数，返回 PermissionEntry[]，
 *   顺序固定为屏幕录制 → 输入监控，文案/图标与 Python 版权限项一致。
 */

import type { ReactElement } from 'react';
import type { TFunction } from 'i18next';
import { InfoIcon, KeyboardIcon } from '@/lib/icons';
import type { PermissionsStatus } from '@/lib/types';

/** 单条权限条目的展示格式（供 PermissionCard 渲染） */
export interface PermissionEntry {
  id: string;
  icon: ReactElement;
  title: string;
  description: string;
  granted: boolean;
}

/**
 * 将后端 PermissionsStatus 转换为 PermissionEntry 列表（屏幕录制 + 输入监控）
 *
 * @param status - 后端返回的权限状态
 * @param t - i18next 翻译函数（welcome ns，复用 permission.screenRecording/inputMonitoring 文案）
 * @returns 用于渲染的权限条目数组
 */
export function mapPermissions(
  status: PermissionsStatus,
  t: TFunction<'welcome'>,
): PermissionEntry[] {
  return [
    {
      id: 'screenCapture',
      icon: <InfoIcon />,
      title: t('permission.screenRecording.title'),
      description: t('permission.screenRecording.description'),
      granted: status.screenCapture.granted,
    },
    {
      id: 'inputMonitoring',
      icon: <KeyboardIcon />,
      title: t('permission.inputMonitoring.title'),
      description: t('permission.inputMonitoring.description'),
      granted: status.inputMonitoring.granted,
    },
  ];
}
