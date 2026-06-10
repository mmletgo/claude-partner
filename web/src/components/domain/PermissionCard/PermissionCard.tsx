/**
 * PermissionCard 业务组件
 *
 * Business Logic（为什么需要这个组件）:
 *   macOS 权限引导欢迎页（屏幕录制/辅助功能/完全磁盘访问）需要把每条权限的状态
 *   渲染成"图标 + 标题 + 说明 + 授权状态/操作"的标准单元。统一的卡片外观和固定的
 *   64px 高度让用户能扫一眼就看到"哪些已授权、哪些还要去系统设置打开"。
 *
 * Code Logic（这个组件做什么）:
 *   - 64px 固定高度，16px 内边距，整体不响应 hover（静态信息）
 *   - 左侧 32x32 容器承载 icon（surface-warm 背景 + accent 文字色）
 *   - 中间标题 --text-md --weight-semibold + 描述 --text-sm --muted
 *   - 右侧根据 granted 切换：true → success Pill "已授权" + CheckIcon；false → primary Button "去设置" + ArrowRightIcon
 */

import { memo, useCallback, type CSSProperties, type ReactNode } from 'react';
import { Button, Pill } from '@/components/primitives';
import { CheckIcon, ArrowRightIcon } from '@/lib/icons';
import styles from './PermissionCard.module.css';

export interface PermissionCardProps {
  /** 大图标，预期是 16-24px 的 SVG/Icon 节点；卡片会把它居中放在 32x32 容器里 */
  icon: ReactNode;
  /** 权限名称，例如"屏幕录制" */
  title: string;
  /** 权限说明，1-2 行即可 */
  description: string;
  /** 是否已授权 */
  granted: boolean;
  /** 点击"去设置"按钮时触发，由父级决定是打开系统设置还是重新检查授权 */
  onRequestAccess?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * 渲染权限引导卡片
 *
 * @param props PermissionCardProps
 * @returns 64px 高的静态信息卡片
 */
function PermissionCardInner({ icon, title, description, granted, onRequestAccess, className, style }: PermissionCardProps) {
  const handleClick = useCallback(() => {
    onRequestAccess?.();
  }, [onRequestAccess]);

  const cardClasses = [styles.card, className].filter(Boolean).join(' ');

  return (
    <div className={cardClasses} style={style} data-granted={granted}>
      <div className={styles.iconBox} aria-hidden="true">
        {icon}
      </div>
      <div className={styles.content}>
        <div className={styles.title}>{title}</div>
        <div className={styles.description}>{description}</div>
      </div>
      <div className={styles.action}>
        {granted ? (
          <Pill tone="success" dot className={styles.statusPill}>
            <CheckIcon size={12} />
            <span>已授权</span>
          </Pill>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={handleClick}
            iconRight={<ArrowRightIcon />}
            className={styles.actionButton}
          >
            去设置
          </Button>
        )}
      </div>
    </div>
  );
}

export const PermissionCard = memo(PermissionCardInner);
PermissionCard.displayName = 'PermissionCard';
