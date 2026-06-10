/**
 * DesignSystem 预览页 barrel
 *
 * Business Logic（为什么需要这个入口）:
 *   与其他页面保持一致：App.tsx 用 `import { DesignSystem } from '@/pages/DesignSystem'`
 *   即可拿到页面组件；同时按需 re-export 内部用到的数据/类型，避免外部 import 散落。
 *
 * Code Logic（这个入口做什么）:
 *   re-export DesignSystem 组件本身，供 React Router 配置直接 import。
 */

export { DesignSystem } from './DesignSystem';
