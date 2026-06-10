/**
 * 布局组件 barrel export
 *
 * 包含：
 *  - Window: 窗口容器（圆角阴影）
 *  - TitleBar: macOS 风格标题栏
 *  - Sidebar: 侧边导航栏
 *  - NavItem: 侧边导航项
 *  - ThemeToggle: 浅色/深色主题切换
 *  - AppShell: 整个应用外壳
 */
export { Window } from './Window';
export type { WindowProps } from './Window';

export { TitleBar } from './TitleBar';
export type { TitleBarProps } from './TitleBar';

export { Sidebar } from './Sidebar';
export type { SidebarProps } from './Sidebar';

export { NavItem } from './NavItem';
export type { NavItemProps } from './NavItem';

export { ThemeToggle } from './ThemeToggle';
export type { ThemeToggleProps } from './ThemeToggle';

export { AppShell } from './AppShell';
export type { AppShellProps } from './AppShell';
