/**
 * AppShell（整个应用外壳）
 *
 * Business Logic（为什么需要这个组件）:
 *   Claude Partner 是一个三端（macOS / Windows / Linux）桌面工具，
 *   Web 端需要统一展示"窗口"外观（macOS 风格圆角阴影 + 标题栏 +
 *   侧边导航 + 主内容区），并集中提供版本号、主题切换等公共信息。
 *
 * Code Logic（这个组件做什么）:
 *   - 在视口中居中渲染一个最大 1180x740 的窗口容器
 *   - 顶部 TitleBar（标题 "Claude Partner" + 右侧 ThemeToggle）
 *   - 左侧 Sidebar（Logo "CP" + 5 个 NavItem + 版本号 footer）
 *   - 右侧 main 区域是 <Outlet /> 出口，由 React Router 注入子页面，
 *     main 自带 overflow: auto 实现独立滚动
 *
 *   注意：本组件是 <Outlet /> 容器，children 不直接使用。
 *   如需在非路由上下文复用，请使用 Window + TitleBar + Sidebar 自组装。
 */
import { Outlet } from 'react-router-dom';
import {
  HomeIcon,
  TransferIcon,
  PromptsIcon,
  DevicesIcon,
  SettingsIcon,
} from '../../../lib/icons';
import { TitleBar } from '../TitleBar';
import { Sidebar } from '../Sidebar';
import { NavItem } from '../NavItem';
import { ThemeToggle } from '../ThemeToggle';
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
    <div className={styles.shell}>
      <div className={styles.window}>
        <TitleBar title="Claude Partner">
          <ThemeToggle />
        </TitleBar>
        <Sidebar
          footer={
            <div className={styles.footer}>
              <span className={styles.footerVersion}>v{APP_VERSION}</span>
              <span>Claude Partner</span>
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
            <NavItem to="/devices" label="Devices" icon={<DevicesIcon />} />
            <NavItem to="/settings" label="Settings" icon={<SettingsIcon />} />
          </nav>
        </Sidebar>
        <main className={styles.main}>{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
