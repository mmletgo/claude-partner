/**
 * ProgressBar 原子组件
 *
 * Business Logic（为什么需要这个组件）:
 *   文件传输、Prompt 同步、安装更新等场景都需要可视化进度条，
 *   统一 ProgressBar 让传输/同步模块不必自己实现 track/fill 的样式细节。
 *
 * Code Logic（这个组件做什么）:
 *   渲染一个外层 track + 内层 fill；fill 的 width 反映 0-1 范围的 value；
 *   颜色 tone 决定 fill 颜色（accent/success/warn/danger），size 决定高度；
 *   默认在右侧显示百分比文本，传 children 时整体替换为自定义内容。
 */

import type { HTMLAttributes, ReactNode } from 'react';
import styles from './ProgressBar.module.css';

export type ProgressBarSize = 'sm' | 'md' | 'lg';
export type ProgressBarTone = 'accent' | 'success' | 'warn' | 'danger';

export interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** 进度值，0-1 范围（超出范围会被裁剪到 [0,1]） */
  value: number;
  /** 高度尺寸，sm 4px / md 6px / lg 8px */
  size?: ProgressBarSize;
  /** 填充颜色 tone */
  tone?: ProgressBarTone;
  /** 自定义右侧内容（覆盖默认百分比文本） */
  children?: ReactNode;
  className?: string;
}

/**
 * 把任意 value 限制在 0-1 之间
 *
 * @param v 原始进度
 * @returns 裁剪后的 [0,1] 数值
 */
const clamp01 = (v: number): number => {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
};

/**
 * 渲染统一 ProgressBar
 *
 * @param props ProgressBar 属性
 * @returns <div> 元素
 */
export function ProgressBar(props: ProgressBarProps) {
  const { value, size = 'md', tone = 'accent', children, className, ...rest } = props;
  const safe = clamp01(value);
  const percent = Math.round(safe * 100);

  /**
   * 渲染默认百分比文本
   *
   * @returns "xx%" 文本节点
   */
  const renderDefaultLabel = (): ReactNode => <span className={styles.label}>{percent}%</span>;

  const trackClasses = [styles.track, styles[`size-${size}`], className].filter(Boolean).join(' ');
  const fillClasses = [styles.fill, styles[`tone-${tone}`]].join(' ');

  return (
    <div className={styles.wrapper} {...rest}>
      <div
        className={trackClasses}
        data-size={size}
        data-tone={tone}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span className={fillClasses} style={{ width: `${safe * 100}%` }} />
      </div>
      {children ?? renderDefaultLabel()}
    </div>
  );
}

ProgressBar.displayName = 'ProgressBar';
