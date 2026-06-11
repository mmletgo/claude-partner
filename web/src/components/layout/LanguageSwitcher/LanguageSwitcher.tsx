/**
 * LanguageSwitcher（中英文语言切换器）
 *
 * Business Logic（为什么需要这个组件）:
 *   Sidebar 底部提供全局语言切换入口，让用户在任意页面随手切换中英文。
 *
 * Code Logic（这个组件做什么）:
 *   - useLanguage() 获取 language / setLanguage
 *   - 渲染紧凑的 EN / 中 两段式切换器，高亮当前语言
 */
import { useLanguage } from '../../../hooks/useLanguage';
import type { AppLanguage } from '../../../i18n';
import styles from './LanguageSwitcher.module.css';

export interface LanguageSwitcherProps {
  /** 透传的自定义 className */
  className?: string;
}

const OPTIONS: ReadonlyArray<{ value: AppLanguage; label: string }> = [
  { value: 'en', label: 'EN' },
  { value: 'zh', label: '中' },
];

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { language, setLanguage } = useLanguage();
  const cls = [styles.switcher, className].filter(Boolean).join(' ');

  return (
    <div className={cls} role="group" aria-label="language">
      {OPTIONS.map((opt) => {
        const active = language === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={active ? styles.optionActive : styles.option}
            onClick={() => setLanguage(opt.value)}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
