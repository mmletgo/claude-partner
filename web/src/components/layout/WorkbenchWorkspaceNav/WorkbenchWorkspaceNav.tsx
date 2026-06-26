/**
 * WorkbenchWorkspaceNav 布局组件
 *
 * Business Logic（为什么需要这个组件）:
 *   Workbench 终端和文件预览都需要同样的顶部导航栏：左侧是一组可切换 tab，右侧是一组操作按钮。
 *   抽成布局组件可以保证两处 UI 高度、间距、背景和响应式行为一致，避免重复维护两套导航栏样式。
 *
 * Code Logic（这个组件做什么）:
 *   接收 tabs 和 actions 两个插槽，渲染统一的 Workbench 导航行；不感知 tab 或按钮的业务数据。
 */

import type { ReactElement, ReactNode } from 'react';
import styles from './WorkbenchWorkspaceNav.module.css';

export interface WorkbenchWorkspaceNavProps {
  /** 导航栏可访问名称 */
  ariaLabel: string;
  /** 右侧操作按钮组可访问名称 */
  actionsAriaLabel?: string;
  /** 左侧 tab 列表内容 */
  tabs: ReactNode;
  /** 右侧操作按钮组 */
  actions?: ReactNode;
}

/**
 * 渲染 Workbench 共享导航栏
 *
 * Business Logic（为什么需要这个函数）:
 *   用户在终端与文件预览之间切换时，应看到一致的导航栏布局和操作入口。
 *
 * Code Logic（这个函数做什么）:
 *   用 CSS grid 创建左侧可滚动 tab 区和右侧 action 区；窄宽下 action 区换到下一行。
 */
export function WorkbenchWorkspaceNav(props: WorkbenchWorkspaceNavProps): ReactElement {
  const { ariaLabel, actionsAriaLabel, tabs, actions } = props;

  return (
    <section className={styles.nav} aria-label={ariaLabel}>
      <div className={styles.tabs}>{tabs}</div>
      {actions ? (
        <div className={styles.actions} role={actionsAriaLabel ? 'group' : undefined} aria-label={actionsAriaLabel}>
          {actions}
        </div>
      ) : null}
    </section>
  );
}
