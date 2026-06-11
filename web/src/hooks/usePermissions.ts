/**
 * usePermissions - macOS 权限状态轮询与请求
 *
 * Business Logic（为什么需要这个 hook）:
 *   Welcome 引导页和侧栏底部授权徽标都需要：持续获取屏幕录制/输入监控权限
 *   状态、并在用户点击「请求授权」时触发后端弹系统授权框 + 打开设置面板。
 *   把轮询、请求、就绪判定收敛到一个 hook，避免 Welcome 与徽标各写一套重复逻辑。
 *
 * Code Logic（这个 hook 做什么）:
 *   - 每 2s 调用 configApi.permissions() 轮询，更新 status
 *   - stopWhenGranted=true 时，全部授权后自动停止轮询（Welcome 用）
 *   - requestMissing() 对所有未授权权限调用 configApi.requestPermission，随后立即刷新
 *   - 暴露 status / loading / allGranted / requestMissing / refresh
 *   - 导出 PERMISSION_ONBOARDED_KEY 供 OnboardingGuard 与 Welcome 共享
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { configApi } from '@/api/config';
import type { PermissionType, PermissionsStatus } from '@/lib/types';

/** localStorage key：标记已完成首次权限引导，避免每次启动都跳 Welcome */
export const PERMISSION_ONBOARDED_KEY = 'cp-permission-onboarded';

const POLL_INTERVAL = 2000;

export interface UsePermissionsResult {
  status: PermissionsStatus | null;
  loading: boolean;
  allGranted: boolean;
  /** 请求所有未授权的权限（触发系统弹窗/打开设置面板），完成后刷新 */
  requestMissing: () => Promise<void>;
  /** 手动刷新一次权限状态 */
  refresh: () => Promise<void>;
}

/**
 * 权限状态轮询与请求 hook
 *
 * @param options.stopWhenGranted 全部授权后停止轮询（Welcome 页用 true，侧栏徽标用 false 持续兜底）
 * @returns status / loading / allGranted / requestMissing / refresh
 */
export function usePermissions(
  options: { stopWhenGranted?: boolean } = {},
): UsePermissionsResult {
  const { stopWhenGranted = false } = options;
  const [status, setStatus] = useState<PermissionsStatus | null>(null);
  const statusRef = useRef<PermissionsStatus | null>(null);

  // 在 effect 中同步 ref，避免 render 期间写 ref（react-hooks/refs 规则）
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const refresh = useCallback(async () => {
    try {
      const s = await configApi.permissions();
      setStatus(s);
    } catch {
      // 接口失败保持当前状态，下轮重试
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const poll = async () => {
      await refresh();
      const current = statusRef.current;
      if (!current) return;
      const done = current.screenCapture.granted && current.inputMonitoring.granted;
      if (done && stopWhenGranted && !stopped) {
        stopped = true;
        if (timer) {
          window.clearInterval(timer);
          timer = null;
        }
      }
    };

    void poll();
    timer = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL);

    return () => {
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [refresh, stopWhenGranted]);

  const requestMissing = useCallback(async () => {
    const current = statusRef.current;
    const types: PermissionType[] = [];
    if (current && !current.screenCapture.granted) types.push('screenCapture');
    if (current && !current.inputMonitoring.granted) types.push('inputMonitoring');
    if (types.length === 0) return;
    await Promise.all(types.map((t) => configApi.requestPermission(t)));
    await refresh();
  }, [refresh]);

  const allGranted =
    !!status && status.screenCapture.granted && status.inputMonitoring.granted;

  return { status, loading: status === null, allGranted, requestMissing, refresh };
}
