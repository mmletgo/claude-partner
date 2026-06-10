/**
 * ThemeToggle（浅色/深色主题切换按钮）
 *
 * Business Logic（为什么需要这个组件）:
 *   应用需要为用户提供浅色/深色主题切换入口，并保证选择
 *   在页面刷新与跨标签页之间持续生效，同时所有展示组件
 *   能通过 CSS 变量立即响应。
 *
 * Code Logic（这个组件做什么）:
 *   - 调用 useTheme() hook 获取 theme / toggleTheme
 *   - 渲染一个 26x26 圆形按钮：浅色态显示 MoonIcon，
 *     深色态显示 SunIcon（图标语义代表"切换到的目标"）
 *   - 主题切换通过 hook 统一写入 localStorage + 派发
 *     'cp-theme-change' 事件 + 设置 document.data-theme
 */
import { MoonIcon, SunIcon } from '../../../lib/icons';
import { useTheme } from '../../../hooks/useTheme';
import styles from './ThemeToggle.module.css';

export interface ThemeToggleProps {
  /** 透传的自定义 className */
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const cls = [styles.toggle, className].filter(Boolean).join(' ');
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={cls}
      onClick={toggleTheme}
      aria-label={isDark ? 'switch to light theme' : 'switch to dark theme'}
      title={isDark ? 'Switch to light' : 'Switch to dark'}
    >
      <span className={styles.icon}>
        {isDark ? <SunIcon size={14} /> : <MoonIcon size={14} />}
      </span>
    </button>
  );
}
