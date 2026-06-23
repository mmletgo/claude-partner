/**
 * CLAUDE.md API - 通过 Tauri invoke 调用 Rust 后端的 user 级 CLAUDE.md 读写与推送命令
 *
 * Business Logic（为什么需要这个模块）:
 *   用户希望在应用内直接编辑 user 级全局指令文件（~/.claude/CLAUDE.md），
 *   并能一键推送到局域网其他设备和 GitHub 云端。本模块封装 get/update/push 三个后端命令，
 *   供 ClaudeMd 页面调用。
 *
 * Code Logic（这个模块做什么）:
 *   - `get`: 读取当前 CLAUDE.md 内容 + 元数据（updatedAt / deviceId / vectorClock）
 *   - `update`: 写入新内容，返回更新后的 dto（含递增后的向量时钟）
 *   - `push`: 保存当前本机内容并推送到局域网设备 + GitHub 云端，返回 accepted/synced/note 结果
 */

import { invoke } from './client';

/** 后端返回的 CLAUDE.md 数据传输对象 */
export interface ClaudeMdDto {
  content: string;
  updatedAt: string;
  deviceId: string;
  vectorClock: Record<string, number>;
}

/** push_claude_md 返回结果 */
export interface PushResult {
  accepted: boolean;
  synced: number;
  note: string;
}

export const claudeMdApi = {
  /** 读取当前 CLAUDE.md 内容与元数据 */
  get: () => invoke<ClaudeMdDto>('get_claude_md'),

  /** 写入新内容（会递增本设备向量时钟），返回更新后的 dto */
  update: (content: string) => invoke<ClaudeMdDto>('update_claude_md', { content }),

  /** 保存并推送本机 CLAUDE.md 到局域网设备和 GitHub 云端，不拉取远端内容 */
  push: (content: string) => invoke<PushResult>('push_claude_md', { content }),
};
