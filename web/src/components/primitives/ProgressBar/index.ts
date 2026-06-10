/**
 * ProgressBar 组件入口
 *
 * Business Logic（为什么需要这个组件）:
 *   统一 ProgressBar 对外导入路径。
 *
 * Code Logic（这个组件做什么）:
 *   重导出 ProgressBar 组件与相关类型。
 */

export { ProgressBar } from './ProgressBar';
export type { ProgressBarProps, ProgressBarSize, ProgressBarTone } from './ProgressBar';
