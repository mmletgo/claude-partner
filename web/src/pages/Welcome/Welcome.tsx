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
 *   - 权限状态由 useEffect + setInterval 每 2s 调用 configApi.permissions() 轮询
 *   - 所有权限就绪后自动停止轮询
 *   - "继续使用"按钮在权限全部就绪后启用，跳转到首页
 *   - 所有 hooks 集中在组件顶部，early return 之前
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/primitives';
import { PermissionCard } from '@/components/domain';
import { configApi } from '@/api/config';
import {
  InfoIcon,
  KeyboardIcon,
  AlertIcon,
  ArrowRightIcon,
} from '@/lib/icons';
import styles from './Welcome.module.css';

/** 单条权限条目的展示格式 */
interface PermissionEntry {
  id: string;
  icon: ReactElement;
  title: string;
  description: string;
  granted: boolean;
}

/**
 * 将后端 PermissionsStatus 转换为 PermissionEntry 列表
 *
 * @param status - 后端返回的权限状态
 * @param t - i18next 翻译函数（welcome ns）
 * @returns 用于渲染的权限条目数组
 */
function mapPermissions(
  status: {
    screenCapture: { granted: boolean };
    inputMonitoring: { granted: boolean };
  },
  t: TFunction<'welcome'>,
): PermissionEntry[] {
  return [
    {
      id: 'screenRecording',
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
    {
      id: 'notifications',
      icon: <AlertIcon />,
      title: t('permission.notifications.title'),
      description: t('permission.notifications.description'),
      granted: true, // 通知不需要特殊权限
    },
  ];
}

/**
 * Welcome 页面根组件
 *
 * Business Logic:
 *   首次使用时引导用户授予系统权限，确保截图、快捷键等核心功能可用。
 *
 * Code Logic:
 *   通过 configApi.permissions() 每 2 秒轮询后端权限状态，
 *   全部授权后停止轮询并启用"继续使用"按钮。
 *
 * @returns 全屏权限引导页（不进入 AppShell）
 */
export function Welcome() {
  const { t } = useTranslation(['welcome']);
  const navigate = useNavigate();
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  // 用于在回调中读取最新 permissions 而不重新注册 effect
  const permissionsRef = useRef<PermissionEntry[]>(permissions);
  permissionsRef.current = permissions;

  // 轮询真实权限状态：每 2 秒调用后端 API
  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;

    const checkPermissions = async () => {
      try {
        const status = await configApi.permissions();
        const entries = mapPermissions(status, t);
        setPermissions(entries);

        // 所有权限都已授权，停止轮询
        if (entries.every((p) => p.granted)) {
          if (timerId !== null) {
            window.clearInterval(timerId);
            timerId = null;
          }
        }
      } catch {
        // API 调用失败时保持当前状态，下次轮询重试
      }
    };

    // 首次立即检查
    void checkPermissions();

    // 每 2 秒轮询
    timerId = window.setInterval(() => {
      void checkPermissions();
    }, 2000);

    return () => {
      if (timerId !== null) {
        window.clearInterval(timerId);
      }
    };
  }, []);

  const allGranted = permissions.length > 0 && permissions.every((p) => p.granted);

  // 暂时跳过：导航到首页
  const handleSkip = useCallback(() => {
    navigate('/');
  }, [navigate]);

  // 继续使用：权限已就绪，导航到首页
  const handleContinue = useCallback(() => {
    navigate('/');
  }, [navigate]);

  // loading 状态：permissions 为空表示首次 API 请求尚未返回
  if (permissions.length === 0) {
    return (
      <div className={styles.backdrop}>
        <div className={styles.window} role="dialog" aria-label={t('welcome:title')}>
          <div className={styles.brand} aria-hidden="true">
            CP
          </div>
          <h1 className={styles.title}>{t('welcome:title')}</h1>
          <p className={styles.subtitle}>{t('welcome:checkingPermission')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.window} role="dialog" aria-label={t('welcome:title')}>
        <div className={styles.brand} aria-hidden="true">
          CP
        </div>

        <h1 className={styles.title}>{t('welcome:title')}</h1>
        <p className={styles.subtitle}>{t('welcome:subtitle')}</p>

        <div className={styles.permissionList} aria-label={t('welcome:permissionListAriaLabel')}>
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
            {allGranted ? t('welcome:permissionReady') : t('welcome:waitingPermission')}
          </span>
          <div className={styles.actions}>
            <Button variant="ghost" size="md" onClick={handleSkip}>
              {t('welcome:skip')}
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={!allGranted}
              onClick={handleContinue}
              iconRight={<ArrowRightIcon />}
            >
              {t('welcome:continue')}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default Welcome;
