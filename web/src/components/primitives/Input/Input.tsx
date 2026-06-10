/**
 * Input 原子组件
 *
 * Business Logic（为什么需要这个组件）:
 *   应用内有大量文本输入场景（搜索框、文件名、Prompt 文本、端口号等），
 *   统一 Input 的视觉与图标位布局可避免业务方重复实现 focus/disabled/mono 等细节，
 *   并与 Button/Card 等其他原子件保持 token 一致。
 *
 * Code Logic（这个组件做什么）:
 *   渲染一个外层 wrapper 承载左右图标与 focus 样式，底层为原生 <input>；
 *   受控组件：value/onChange 由父级管理；额外提供 mono 字体变体便于输入端口/token；
 *   使用 React.forwardRef 暴露底层 input ref 以支持 autoFocus/select 文本等。
 */

import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import styles from './Input.module.css';

export type InputType = 'text' | 'search' | 'password' | 'number';
export type InputSize = 'sm' | 'md';

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  /** input 类型 */
  type?: InputType;
  /** 受控值 */
  value: string | number;
  /** 受控变更回调 */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** 占位文本 */
  placeholder?: string;
  /** 左侧图标 */
  icon?: ReactNode;
  /** 右侧图标（通常是可点击的清除/搜索按钮） */
  iconRight?: ReactNode;
  /** 禁用态 */
  disabled?: boolean;
  /** 尺寸，sm 26px / md 32px */
  size?: InputSize;
  /** 使用等宽字体（适合端口/token） */
  mono?: boolean;
  /** 透传 className */
  className?: string;
}

/**
 * 渲染统一 Input
 *
 * @param props 继承原生 input 属性 + 视觉扩展
 * @returns 包裹图标的 input 容器
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(props, ref) {
  const {
    type = 'text',
    value,
    onChange,
    placeholder,
    icon,
    iconRight,
    disabled = false,
    size = 'md',
    mono = false,
    className,
    onFocus,
    onBlur,
    ...rest
  } = props;

  const [focused, setFocused] = useState(false);

  const wrapperClasses = [
    styles.wrapper,
    styles[`size-${size}`],
    focused ? styles.focused : '',
    disabled ? styles.disabled : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const inputClasses = [styles.input, mono ? styles.mono : ''].filter(Boolean).join(' ');

  return (
    <div data-size={size} data-disabled={disabled || undefined} className={wrapperClasses}>
      {icon ? <span className={styles.iconLeft}>{icon}</span> : null}
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClasses}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {iconRight ? <span className={styles.iconRight}>{iconRight}</span> : null}
    </div>
  );
});

Input.displayName = 'Input';
