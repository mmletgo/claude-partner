/**
 * Pill 状态标签
 *
 * Business Logic（为什么需要这个组件）:
 *   设备列表、传输状态、Prompt 同步状态等场景需要在标题旁标注小尺寸状态徽章（Online/Syncing/Error），
 *   Pill 是比 Tag 更紧凑的版本，避免与“分类标签”视觉混淆。
 *
 * Code Logic（这个组件做什么）:
 *   渲染一个圆角矩形小徽章；tone 决定背景与文字颜色（5 种）；
 *   dot=true 时在文本左侧显示 6px 同色圆点。
 */

import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Pill.module.css';

export type PillTone = 'neutral' | 'success' | 'warn' | 'danger' | 'accent';

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  /** 颜色 tone */
  tone?: PillTone;
  /** 显示前置小圆点 */
  dot?: boolean;
  className?: string;
}

/**
 * 渲染统一 Pill 状态标签
 *
 * @param props Pill 属性
 * @returns <span> 元素
 */
export function Pill(props: PillProps) {
  const { children, tone = 'neutral', dot = false, className, ...rest } = props;

  const classes = [styles.pill, styles[`tone-${tone}`], className].filter(Boolean).join(' ');

  return (
    <span data-tone={tone} className={classes} {...rest}>
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

Pill.displayName = 'Pill';
