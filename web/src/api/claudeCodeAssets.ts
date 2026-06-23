/**
 * Claude Code Assets API - 本机管理与局域网选择性拉取
 *
 * Business Logic（为什么需要这个模块）:
 *   Claude Code assets 页面需要列出/启停/安装/卸载本机资源，并从局域网设备选择性拉取资源。
 *
 * Code Logic（这个模块做什么）:
 *   对 Tauri invoke 命令做薄封装，统一传递 camelCase 参数与前端类型。
 */

import { invoke } from './client';
import type {
  ClaudeCodeAsset,
  ClaudeCodeAssetInstallReport,
  ClaudeCodeAssetKind,
  ClaudeCodeAssetSelector,
  ClaudeCodeInstallSource,
} from '@/lib/types';

export const claudeCodeAssetsApi = {
  /** 列出本机 Claude Code assets */
  list: () => invoke<ClaudeCodeAsset[]>('list_claude_code_assets'),

  /** 启用/禁用一个 asset */
  setEnabled: (kind: ClaudeCodeAssetKind, id: string, enabled: boolean) =>
    invoke<ClaudeCodeAssetInstallReport>('set_claude_code_asset_enabled', {
      kind,
      id,
      enabled,
    }),

  /** 从本机路径或 JSON 安装一个 asset */
  install: (source: ClaudeCodeInstallSource) =>
    invoke<ClaudeCodeAssetInstallReport>('install_claude_code_asset', { source }),

  /** 卸载一个 asset */
  uninstall: (kind: ClaudeCodeAssetKind, id: string, keepData = false) =>
    invoke<ClaudeCodeAssetInstallReport>('uninstall_claude_code_asset', {
      kind,
      id,
      keepData,
    }),

  /** 列出某个局域网设备可拉取的 assets */
  listRemote: (deviceId: string) =>
    invoke<ClaudeCodeAsset[]>('list_remote_claude_code_assets', { deviceId }),

  /** 从某个局域网设备按选择器拉取 assets */
  pullRemote: (deviceId: string, items: ClaudeCodeAssetSelector[], overwrite: boolean) =>
    invoke<ClaudeCodeAssetInstallReport>('pull_claude_code_assets', {
      deviceId,
      items,
      overwrite,
    }),
};
