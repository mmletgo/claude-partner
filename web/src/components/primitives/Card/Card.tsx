/**
 * Card 复合组件（Card / Card.Header / Card.Body / Card.Footer）
 *
 * Business Logic（为什么需要这个组件）:
 *   应用内有大量“带标题 + 内容 + 操作按钮”的容器场景（设置项、提示卡、Prompt 预览等），
 *   Card 提供一致的容器外观（flat/elevated/outlined）以及结构化子区域（Header/Body/Footer），
 *   避免业务方手写 div 拼装导致视觉漂移。
 *
 * Code Logic（这个组件做什么）:
 *   使用 React Context 在父 Card 与子 Header/Body/Footer 之间共享 variant 与 padding；
 *   子组件读取 context 决定自身 padding（也支持局部 props 覆盖）；
 *   复合组件通过 Object.assign 暴露为 Card.X，让调用方可链式书写。
 */
/* eslint-disable react-refresh/only-export-components -- 复合组件 Object.assign 模式，Header/Body/Footer 为组件属性，react-refresh 误报 */

import { createContext, useContext } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export type CardVariant = 'flat' | 'elevated' | 'outlined';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

/** Card 上下文，子组件通过它继承父容器的 variant / padding */
interface CardContextValue {
  variant: CardVariant;
  padding: CardPadding;
}

const CardContext = createContext<CardContextValue | null>(null);

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** 视觉变体：flat/elevated/outlined */
  variant?: CardVariant;
  /** 内部 padding 预设，影响 Body/Header/Footer */
  padding?: CardPadding;
  children?: ReactNode;
  className?: string;
}

/**
 * 渲染 Card 根容器
 *
 * @param props Card 属性
 * @returns <article> 元素包裹内容
 */
function CardRoot(props: CardProps) {
  const { variant = 'flat', padding = 'md', className, children, ...rest } = props;

  const ctx: CardContextValue = { variant, padding };

  const classes = [
    styles.card,
    styles[`variant-${variant}`],
    styles[`padding-${padding}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <CardContext.Provider value={ctx}>
      <article data-variant={variant} data-padding={padding} className={classes} {...rest}>
        {children}
      </article>
    </CardContext.Provider>
  );
}

export interface CardHeaderProps extends HTMLAttributes<HTMLElement> {
  /** 局部覆盖父级 padding；不传则继承 Card 的 padding */
  padding?: CardPadding;
  children?: ReactNode;
  className?: string;
}

/**
 * 渲染 Card 标题区域
 *
 * @param props 透传 HTML 属性 + 可选 padding 覆盖
 * @returns <header> 元素
 */
function CardHeader(props: CardHeaderProps) {
  const ctx = useContext(CardContext);
  const { padding, className, children, ...rest } = props;
  const effectivePadding = padding ?? ctx?.padding ?? 'md';
  const classes = [styles.header, styles[`padding-${effectivePadding}`], className].filter(Boolean).join(' ');
  return (
    <header data-padding={effectivePadding} className={classes} {...rest}>
      {children}
    </header>
  );
}

export interface CardBodyProps extends HTMLAttributes<HTMLElement> {
  /** 局部覆盖父级 padding */
  padding?: CardPadding;
  children?: ReactNode;
  className?: string;
}

/**
 * 渲染 Card 主体区域
 *
 * @param props 透传 HTML 属性 + 可选 padding 覆盖
 * @returns <div> 元素
 */
function CardBody(props: CardBodyProps) {
  const ctx = useContext(CardContext);
  const { padding, className, children, ...rest } = props;
  const effectivePadding = padding ?? ctx?.padding ?? 'md';
  const classes = [styles.body, styles[`padding-${effectivePadding}`], className].filter(Boolean).join(' ');
  return (
    <div data-padding={effectivePadding} className={classes} {...rest}>
      {children}
    </div>
  );
}

export interface CardFooterProps extends HTMLAttributes<HTMLElement> {
  /** 局部覆盖父级 padding */
  padding?: CardPadding;
  children?: ReactNode;
  className?: string;
}

/**
 * 渲染 Card 底部区域（默认右对齐按钮组）
 *
 * @param props 透传 HTML 属性 + 可选 padding 覆盖
 * @returns <footer> 元素
 */
function CardFooter(props: CardFooterProps) {
  const ctx = useContext(CardContext);
  const { padding, className, children, ...rest } = props;
  const effectivePadding = padding ?? ctx?.padding ?? 'md';
  const classes = [styles.footer, styles[`padding-${effectivePadding}`], className].filter(Boolean).join(' ');
  return (
    <footer data-padding={effectivePadding} className={classes} {...rest}>
      {children}
    </footer>
  );
}

/** 复合组件：Card + Header/Body/Footer 子组件 */
export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});

CardRoot.displayName = 'Card';
CardHeader.displayName = 'Card.Header';
CardBody.displayName = 'Card.Body';
CardFooter.displayName = 'Card.Footer';
