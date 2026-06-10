/**
 * TitleBar（macOS 风格标题栏）
 *
 * Business Logic（为什么需要这个组件）:
 *   桌面应用窗口顶部需要呈现交通灯按钮（关闭/最小化/最大化）
 *   与窗口标题，且整行可拖动（mousedown + drag 移动窗口）。
 *   Web 端通过 -webkit-app-region: drag 模拟这一行为，同时确保
 *   traffic lights 和右侧 actions 仍可点击。
 *
 * Code Logic（这个组件做什么）:
 *   渲染一个 44px 高的三段式 grid：左侧 traffic lights 圆点、
 *   中间居中标题、右侧 children 插槽。仅当 onClose / onMinimize /
 *   onMaximize 提供时，对应圆点才标记为可点击（带 click handler）。
 */
import type { ReactNode, MouseEvent } from 'react';
import styles from './TitleBar.module.css';

export interface TitleBarProps {
  /** 居中显示的窗口标题 */
  title?: string;
  /** 右侧 actions 插槽（ThemeToggle / WindowMenu 等） */
  children?: ReactNode;
  /** 关闭按钮（红点）点击回调 */
  onClose?: () => void;
  /** 最小化按钮（黄点）点击回调 */
  onMinimize?: () => void;
  /** 最大化按钮（绿点）点击回调 */
  onMaximize?: () => void;
  /** 透传的自定义 className */
  className?: string;
}

export function TitleBar({
  title,
  children,
  onClose,
  onMinimize,
  onMaximize,
  className,
}: TitleBarProps) {
  const handle =
    (handler?: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      handler?.();
    };

  const cls = [styles.titlebar, className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className={styles.lights}>
        {onClose ? (
          <button
            type="button"
            aria-label="close"
            className={`${styles.light} ${styles['light--red']} ${styles['light--clickable']}`}
            onClick={handle(onClose)}
          />
        ) : (
          <span
            aria-hidden="true"
            className={`${styles.light} ${styles['light--red']}`}
          />
        )}
        {onMinimize ? (
          <button
            type="button"
            aria-label="minimize"
            className={`${styles.light} ${styles['light--yellow']} ${styles['light--clickable']}`}
            onClick={handle(onMinimize)}
          />
        ) : (
          <span
            aria-hidden="true"
            className={`${styles.light} ${styles['light--yellow']}`}
          />
        )}
        {onMaximize ? (
          <button
            type="button"
            aria-label="maximize"
            className={`${styles.light} ${styles['light--green']} ${styles['light--clickable']}`}
            onClick={handle(onMaximize)}
          />
        ) : (
          <span
            aria-hidden="true"
            className={`${styles.light} ${styles['light--green']}`}
          />
        )}
      </div>
      <div className={styles.title}>{title}</div>
      <div className={styles.actions}>{children}</div>
    </div>
  );
}
