/**
 * Scratchpad API - 通过 Tauri invoke 调用 Rust 后端多页面速记本命令
 *
 * Business Logic（为什么需要这个模块）:
 *   速记本内容权威源在 Rust/SQLite，前端页面不能直接读写 localStorage。
 *   本模块集中封装页面列表、读取、创建、保存、重命名、删除和同步命令。
 *
 * Code Logic（这个模块做什么）:
 *   调用 list_scratchpad_pages / get_scratchpad_page / create_scratchpad_page /
 *   update_scratchpad_page_content / rename_scratchpad_page / delete_scratchpad_page /
 *   sync_scratchpad invoke 命令，返回类型与 Rust DTO 对齐。
 */

import { invoke } from './client';
import type {
  LanSyncResult,
  ScratchpadDeleteResult,
  ScratchpadPage,
  ScratchpadPageSummary,
} from '@/lib/types';

export const scratchpadApi = {
  /** 获取速记本页面摘要列表，后端按 updatedAt DESC 排序 */
  listPages: () => invoke<ScratchpadPageSummary[]>('list_scratchpad_pages'),

  /** 读取指定速记本页面完整内容 */
  getPage: (pageId: string) => invoke<ScratchpadPage>('get_scratchpad_page', { pageId }),

  /** 创建速记本页面，title 为空时由后端/前端默认值兜底 */
  createPage: (title?: string) => invoke<ScratchpadPage>('create_scratchpad_page', { title }),

  /** 更新指定页面正文内容 */
  updatePageContent: (pageId: string, content: string) =>
    invoke<ScratchpadPage>('update_scratchpad_page_content', { pageId, content }),

  /** 重命名指定页面 */
  renamePage: (pageId: string, title: string) =>
    invoke<ScratchpadPage>('rename_scratchpad_page', { pageId, title }),

  /** 删除指定页面 */
  deletePage: (pageId: string) =>
    invoke<ScratchpadDeleteResult>('delete_scratchpad_page', { pageId }),

  /** 触发速记本同步 */
  sync: () => invoke<LanSyncResult>('sync_scratchpad'),
};
