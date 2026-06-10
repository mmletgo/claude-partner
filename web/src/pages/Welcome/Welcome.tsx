/**
 * Welcome 欢迎/权限引导页
 *
 * Business Logic（为什么需要这个页面）:
 *   macOS 等系统要求桌面工具在首次使用前明确申请"屏幕录制 / 输入监控 / 通知"等敏感权限，
 *   否则后续功能（截图、快捷键、系统通知）会静默失败。Welcome 页在路由层
 *   独立于 AppShell（不进入主窗口），给用户一个"先授权再用"的明确引导。
 *
 * Code Logic（这个页面做什么）:
 *   - 全屏深色背景（#1a1815 + 双 terracotta 光晕）模拟 macOS 权限弹窗
 *   - 居中 Window 容器（480x520）展示 logo / 标题 / 三条权限卡 / CTA 按钮
 *   - 三条权限卡用 PermissionCard：屏幕录制 / 输入监控 / 通知
 *   - 权限状态由 useEffect + setInterval 模拟：2s 模拟一次；3s 后全部 granted
 *   - "继续使用"按钮在权限全部就绪后启用
 *   - 所有 hooks 集中在组件顶部，early return 之前
 */

import { useEffect, useState, useCallback } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/primitives';
import { PermissionCard } from '@/components/domain';
import {
  InfoIcon,
  KeyboardIcon,
  AlertIcon,
  ArrowRightIcon,
} from '@/lib/icons';
import styles from './Welcome.module.css';

interface PermissionEntry {
  id: string;
  icon: ReactElement;
  title: string;
  description: string;
  granted: boolean;
}

const INITIAL_PERMISSIONS: PermissionEntry[] = [
  {
    id: 'screen',
    icon: <InfoIcon />,
    title: '屏幕录制',
    description: '允许截取屏幕内容',
    granted: false,
  },
  {
    id: 'input',
    icon: <KeyboardIcon />,
    title: '输入监控',
    description: '允许全局快捷键',
    granted: false,
  },
  {
    id: 'notification',
    icon: <AlertIcon />,
    title: '通知权限',
    description: '允许发送系统通知',
    granted: false,
  },
];

/**
 * Welcome 页面根组件
 *
 * @returns 全屏权限引导页（不进入 AppShell）
 */
export function Welcome() {
  const [permissions, setPermissions] = useState<PermissionEntry[]>(INITIAL_PERMISSIONS);
  // 记录首次渲染时间戳；3s 后自动把所有权限置为 granted
  const [mountedAt] = useState<number>(() => Date.now());

  // 模拟权限轮询：每 2 秒请求一次"授权状态"
  useEffect(() => {
    const tick = window.setInterval(() => {
      setPermissions((prev) => {
        // 已经全部授权就不重复 setState
        if (prev.every((p) => p.granted)) return prev;
        return prev.map((p, idx) => {
          // 错开激活顺序：1s/2s/3s 依次点亮，呈现"逐项就绪"的真实感
          const elapsed = Date.now() - mountedAt;
          const threshold = (idx + 1) * 1000;
          return elapsed >= threshold ? { ...p, granted: true } : p;
        });
      });
    }, 2000);
    return () => {
      window.clearInterval(tick);
    };
  }, [mountedAt]);

  // 3s 后强制把剩余未授权的全部点亮（兜底）
  useEffect(() => {
    const fallback = window.setTimeout(() => {
      setPermissions((prev) => prev.map((p) => ({ ...p, granted: true })));
    }, 3000);
    return () => {
      window.clearTimeout(fallback);
    };
  }, []);

  const allGranted = permissions.every((p) => p.granted);

  // 暂时跳过的回调：mock 行为，仅打印到控制台
  const handleSkip = useCallback(() => {
    // eslint-disable-next-line no-console
    console.info('[Welcome] 用户选择暂时跳过权限引导');
  }, []);

  // 继续使用的回调：mock 行为，仅打印到控制台
  const handleContinue = useCallback(() => {
    // eslint-disable-next-line no-console
    console.info('[Welcome] 权限已就绪，进入应用');
  }, []);

  return (
    <div className={styles.backdrop}>
      <div className={styles.window} role="dialog" aria-label="欢迎使用 Claude Partner">
        <div className={styles.brand} aria-hidden="true">
          CP
        </div>

        <h1 className={styles.title}>欢迎使用 Claude Partner</h1>
        <p className={styles.subtitle}>需要授予以下权限以启用完整功能</p>

        <div className={styles.permissionList} aria-label="权限列表">
          {permissions.map((p) => (
            <PermissionCard
              key={p.id}
              icon={p.icon}
              title={p.title}
              description={p.description}
              granted={p.granted}
            />
          ))}
        </div>

        <footer className={styles.footer}>
          <span className={styles.hint}>
            {allGranted ? '权限已就绪' : '正在等待系统授权…'}
          </span>
          <div className={styles.actions}>
            <Button variant="ghost" size="md" onClick={handleSkip}>
              暂时跳过
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={!allGranted}
              onClick={handleContinue}
              iconRight={<ArrowRightIcon />}
            >
              继续使用
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default Welcome;
