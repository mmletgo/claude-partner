/**
 * Button 组件入口
 *
 * Business Logic（为什么需要这个组件）:
 *   统一按钮的对外导入路径，调用方只需 `import { Button } from '@/components/primitives/Button'`。
 *
 * Code Logic（这个组件做什么）:
 *   重导出 Button 组件与相关类型，避免外部依赖具体文件路径。
 */

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
