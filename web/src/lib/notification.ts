/**
 * notification - 通知权限检测/请求（@tauri-apps/plugin-notification 封装）
 *
 * Business Logic（为什么需要这个模块）:
 *   cc-partner 通过系统通知推送健康提醒（久坐/喝水）。macOS 需用户授权「通知」权限，
 *   欢迎页/设置页的第 4 个权限引导需检测与请求它。通知权限不属于 TCC（不走 Rust FFI），
 *   由 tauri-plugin-notification 的 JS API 管理，故独立成模块供 usePermissions hook 与
 *   Settings 页共用（项目规则 9 复用，避免两处各写一份）。
 *
 * Code Logic（这个模块做什么）:
 *   - checkNotificationGranted(): macOS 调 isPermissionGranted()，非 macOS 视为已授权
 *   - requestNotificationPermission(): macOS 调 requestPermission()，非 macOS no-op
 *   两者探测/请求失败均保守降级（视为已授权 / 静默），不阻断主流程（通知是可选功能）。
 */

import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { isMacos } from './platform';

/**
 * 查询通知授权状态
 *
 * Business Logic: usePermissions 轮询时合并进统一权限视图，供权限卡片显示授权状态。
 * Code Logic: 非 macOS 一律返回 true（不引导）；macOS 调 isPermissionGranted()，
 *   异常保守返回 true（探测失败不阻断）。
 *
 * @returns 是否已授权发送通知
 */
export async function checkNotificationGranted(): Promise<boolean> {
  if (!isMacos()) return true;
  try {
    return await isPermissionGranted();
  } catch {
    // 探测失败保守视为已授权，不阻断主流程
    return true;
  }
}

/**
 * 请求通知权限
 *
 * Business Logic: 用户在欢迎页/设置页点「去设置」时触发，弹系统通知授权框。
 * Code Logic: 非 macOS no-op；macOS 调 requestPermission()（返回 granted/denied/default）。
 *   授权状态由 usePermissions 轮询反映，此处不直接写 state（保持单一数据源）。
 */
export async function requestNotificationPermission(): Promise<void> {
  if (!isMacos()) return;
  try {
    await requestPermission();
  } catch {
    // 请求失败静默，轮询反映真实状态
  }
}
