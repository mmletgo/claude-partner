/**
 * AppShell（整个应用外壳）
 *
 * Business Logic（为什么需要这个组件）:
 *   Claude Partner 是一个三端（macOS / Windows / Linux）桌面工具，
 *   Web 端需要提供侧边导航 + 主内容区的基本布局骨架，
 *   窗口标题栏由 PyQt6 原生提供，无需 Web 端自绘。
 *   侧边栏 footer 区域集中展示版本号和主题切换。
 *
 * Code Logic（这个组件做什么）:
 *   - 全屏 flex 布局：左侧 Sidebar（240px）+ 右侧 main 区域
 *   - Sidebar 内包含 Logo、导航项、footer（版本号 + ThemeToggle）
 *   - 右侧 main 区域是 <Outlet /> 出口，由 React Router 注入子页面，
 *     main 自带 overflow: auto 实现独立滚动
 *
 *   注意：本组件是 <Outlet /> 容器，children 不直接使用。
 */
import { Outlet } from 'react-router-dom';
import {
  HomeIcon,
  TransferIcon,
  PromptsIcon,
  ScratchpadIcon,
  DevicesIcon,
  SettingsIcon,
} from '../../../lib/icons';
import { Sidebar } from '../Sidebar';
import { NavItem } from '../NavItem';
import { ThemeToggle } from '../ThemeToggle';
import { LanguageSwitcher } from '../LanguageSwitcher';
import styles from './AppShell.module.css';

// 版本号应与 src/claude_partner/__init__.py 的 __version__ 保持一致
// 此处先硬编码 0.2.0 作为占位；后续可通过 Vite 环境变量注入
const APP_VERSION = '0.2.0';

export interface AppShellProps {
  /** 路由出口占位（一般由 react-router 注入 <Outlet />，可显式覆盖） */
  children?: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className={styles.layout}>
      <Sidebar
        footer={
          <div className={styles.footer}>
            <span className={styles.footerVersion}>v{APP_VERSION}</span>
            <span>Claude Partner</span>
            <div className={styles.footerToggle}>
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>
        }
      >
        <div className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true">
            CP
          </span>
          <span className={styles.logoText}>Claude Partner</span>
        </div>
        <nav className={styles.navList} aria-label="primary">
          <NavItem to="/" label="Home" icon={<HomeIcon />} />
          <NavItem to="/transfer" label="Transfer" icon={<TransferIcon />} />
          <NavItem to="/prompts" label="Prompts" icon={<PromptsIcon />} />
          <NavItem to="/scratchpad" label="Scratchpad" icon={<ScratchpadIcon />} />
          <NavItem to="/devices" label="Devices" icon={<DevicesIcon />} />
          <NavItem to="/settings" label="Settings" icon={<SettingsIcon />} />
        </nav>
      </Sidebar>
      <main className={styles.main}>{children ?? <Outlet />}</main>
    </div>
  );
}
