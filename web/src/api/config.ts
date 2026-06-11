/**
 * 配置 / 版本 / 更新 / 权限 API 客户端
 *
 * Business Logic:
 *   前端设置页面、欢迎页等需要与后端交互：读写配置、选择目录、
 *   检查更新、下载安装更新、查询权限状态。本模块封装这些 API 调用。
 *
 * Code Logic:
 *   基于 api client 封装 10 个 API 方法，返回类型化的 Promise。
 */

import { api } from './client';
import type {
  AppConfig,
  VersionInfo,
  UpdateCheckResult,
  UpdateDownloadStatus,
  PermissionsStatus,
  PermissionType,
  PermissionRequestResult,
} from '@/lib/types';

export const configApi = {
  /** 获取当前应用配置 */
  get: () => api.get<AppConfig>('/api/config'),

  /** 更新应用配置（仅 deviceName/receiveDir/screenshotHotkey 可写） */
  update: (data: Partial<AppConfig>) => api.put<AppConfig>('/api/config', data),

  /** 打开原生目录选择对话框，返回选中的路径 */
  chooseDir: () => api.post<{ path: string | null }>('/api/config/choose-dir'),

  /** 获取版本号和构建日期 */
  version: () => api.get<VersionInfo>('/api/version'),

  /** 触发 GitHub Releases 更新检查 */
  checkUpdate: () => api.post<UpdateCheckResult>('/api/updater/check'),

  /** 启动更新包下载（透传检查结果的 downloadUrl/filename） */
  downloadUpdate: (url: string, filename: string) =>
    api.post<{ ok: boolean; error?: string }>('/api/updater/download', { url, filename }),

  /** 轮询下载进度状态（前端进度条） */
  getDownloadStatus: () => api.get<UpdateDownloadStatus>('/api/updater/download/status'),

  /** 取消正在进行的下载 */
  cancelDownload: () => api.post<{ ok: boolean; error?: string }>('/api/updater/download/cancel'),

  /** 安装已下载的更新包并重启（进程随后退出） */
  installUpdate: () => api.post<{ ok: boolean; error?: string }>('/api/updater/install'),

  /** 检查 macOS 权限状态（屏幕录制、输入监控） */
  permissions: () => api.get<PermissionsStatus>('/api/permissions'),

  /** 触发权限请求（弹系统授权框 + 打开设置面板） */
  requestPermission: (type: PermissionType) =>
    api.post<PermissionRequestResult>('/api/permissions/request', { type }),
};
