/**
 * CLAUDE.md API - 通过 Tauri invoke 调用 Rust 后端的 user 级 CLAUDE.md 读写与同步命令
 *
 * Business Logic（为什么需要这个模块）:
 *   用户希望在应用内直接编辑 user 级全局指令文件（~/.claude/CLAUDE.md），
 *   并能一键同步到局域网其他设备。本模块封装 get/update/sync 三个后端命令，
 *   供 ClaudeMd 页面调用。
 *
 * Code Logic（这个模块做什么）:
 *   - `get`: 读取当前 CLAUDE.md 内容 + 元数据（updatedAt / deviceId / vectorClock）
 *   - `update`: 写入新内容，返回更新后的 dto（含递增后的向量时钟）
 *   - `sync`: 触发一次跨设备 P2P 同步，返回 accepted/synced/note 结果
 */

import { invoke } from './client';

/** 后端返回的 CLAUDE.md 数据传输对象 */
export interface ClaudeMdDto {
  content: string;
  updatedAt: string;
  deviceId: string;
  vectorClock: Record<string, number>;
}

/** trigger_sync 返回结果 */
export interface SyncResult {
  accepted: boolean;
  synced: number;
  note: string;
}

export const claudeMdApi = {
  /** 读取当前 CLAUDE.md 内容与元数据 */
  get: () => invoke<ClaudeMdDto>('get_claude_md'),

  /** 写入新内容（会递增本设备向量时钟），返回更新后的 dto */
  update: (content: string) => invoke<ClaudeMdDto>('update_claude_md', { content }),

  /** 触发一次跨设备同步，返回同步结果 */
  sync: () => invoke<SyncResult>('trigger_sync'),
};
