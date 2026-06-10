/**
 * Card 组件入口
 *
 * Business Logic（为什么需要这个组件）:
 *   统一 Card 复合组件的对外导入路径，调用方只需 `import { Card } from '@/components/primitives/Card'`。
 *
 * Code Logic（这个组件做什么）:
 *   重导出 Card 复合组件与相关类型。
 */

export { Card } from './Card';
export type { CardProps, CardHeaderProps, CardBodyProps, CardFooterProps, CardVariant, CardPadding } from './Card';
