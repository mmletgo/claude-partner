/**
 * NavItem（侧边导航项）
 *
 * Business Logic（为什么需要这个组件）:
 *   侧边栏需要统一的导航项视觉：图标 + 文字 + 可选徽章，且
 *   应当与 React Router 路由状态联动，自动高亮当前激活项。
 *
 * Code Logic（这个组件做什么）:
 *   渲染一个 36px 高的 flex 行；内部用 react-router-dom 的
 *   NavLink 实现路由匹配与高亮（active 由 NavLink 自动提供），
 *   同时支持外部传入 active / onClick，覆盖非路由场景。
 *   样式通过 data-active 属性切换 active 态。
 */
import type { ReactNode, MouseEvent } from 'react';
import { NavLink } from 'react-router-dom';
import styles from './NavItem.module.css';

export interface NavItemProps {
  /** 左侧 16x16 图标（通常是 icon 系统中的某个函数组件） */
  icon?: ReactNode;
  /** 导航项文字 */
  label: string;
  /** 目标路由地址 */
  to: string;
  /** 强制 active 状态（默认由 NavLink 自动计算） */
  active?: boolean;
  /** 右侧圆形徽章（数字或文字，如未读数） */
  badge?: string | number;
  /** 自定义点击回调（仍会触发路由跳转） */
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  /** 透传的自定义 className */
  className?: string;
}

export function NavItem({
  icon,
  label,
  to,
  active,
  badge,
  onClick,
  className,
}: NavItemProps) {
  const cls = [styles.item, className].filter(Boolean).join(' ');

  // 当外部传入 active 时使用之；否则交给 NavLink 自行计算
  const isControlled = active !== undefined;

  return (
    <NavLink
      to={to}
      onClick={onClick}
      end={to === '/'}
      className={({ isActive }) => {
        const computedActive = isControlled ? active : isActive;
        return computedActive ? `${cls} ${styles['item--active']}` : cls;
      }}
    >
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <span className={styles.label}>{label}</span>
      {badge !== undefined && badge !== null && badge !== '' ? (
        <span className={styles.badge}>{badge}</span>
      ) : null}
    </NavLink>
  );
}
