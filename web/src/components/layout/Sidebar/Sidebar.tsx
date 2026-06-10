/**
 * Sidebar（侧边导航栏）
 *
 * Business Logic（为什么需要这个组件）:
 *   主窗口需要一个固定的左侧导航区域，集中展示 Logo / 导航项 /
 *   用户/版本信息等 footer；高度需要跟随主窗口自适应、过长时
 *   可独立滚动。
 *
 * Code Logic（这个组件做什么）:
 *   渲染一个 240px 宽的 flex column 容器，children 作为顶部主
 *   内容，footer 通过 margin-top: auto 固定到底部；超出高度
 *   时内部出现滚动条。
 */
import type { ReactNode } from 'react';
import styles from './Sidebar.module.css';

export interface SidebarProps {
  /** 顶部主内容区（Logo + NavItem 列表等） */
  children: ReactNode;
  /** 底部 footer 插槽（版本号、用户信息等），自动贴底 */
  footer?: ReactNode;
  /** 透传的自定义 className */
  className?: string;
}

export function Sidebar({ children, footer, className }: SidebarProps) {
  const cls = [styles.sidebar, className].filter(Boolean).join(' ');
  return (
    <aside className={cls}>
      <div className={styles.content}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </aside>
  );
}
