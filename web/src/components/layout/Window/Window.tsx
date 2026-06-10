/**
 * Window（窗口容器）
 *
 * Business Logic（为什么需要这个组件）:
 *   Claude Partner 是一个跨平台桌面工具（macOS / Windows / Linux），
 *   在 Web 端需要模拟 macOS 窗口外观以保持品牌一致性，并承载
 *   TitleBar / Sidebar / Main 三段式布局骨架。
 *
 * Code Logic（这个组件做什么）:
 *   渲染一个具备圆角、大阴影的容器，内部用 grid 划分 titlebar
 *   和 (sidebar + main) 两个区域，children 透传以便使用者
 *   自定义内部结构。尺寸缺省走 design token（--window-width / --window-height）。
 */
import type { ReactNode } from 'react';
import styles from './Window.module.css';

export interface WindowProps {
  /** 容器内任意内容，通常由 TitleBar + Sidebar + Main 组成 */
  children: ReactNode;
  /** 窗口宽度（px），缺省走 token --window-width (1180) */
  width?: number;
  /** 窗口高度（px），缺省走 token --window-height (740) */
  height?: number;
  /** 透传的自定义 className */
  className?: string;
}

export function Window({ children, width, height, className }: WindowProps) {
  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = `${width}px`;
  if (height !== undefined) style.height = `${height}px`;

  const cls = [styles.window, className].filter(Boolean).join(' ');
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}
