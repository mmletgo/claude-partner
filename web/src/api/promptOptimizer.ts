/**
 * Prompt 优化 API - 通过 Tauri invoke 调用 Rust 后端 Claude CLI 优化命令
 *
 * Business Logic（为什么需要这个模块）:
 *   Prompt 优化页需要把用户输入发送给本机 Claude Code CLI，并展示中英文优化结果。
 *
 * Code Logic（这个模块做什么）:
 *   封装 `optimize_prompt` invoke，组件层只消费类型化 Promise，不接触命令名细节。
 */

import { invoke } from './client';
import type { PromptOptimizeResponse, PromptOptimizerFillLanguage } from '@/lib/types';

/**
 * Prompt 优化调用选项。
 *
 * Business Logic（为什么需要这个类型）:
 *   Workbench 优化 prompt 时需要把当前项目根目录传给后端，普通优化页则保持无项目上下文。
 *
 * Code Logic（这个类型做什么）:
 *   workingDirectory 为可选绝对目录路径；targetLanguage 供 Workbench 小组件请求单语结果。
 */
export interface PromptOptimizerOptions {
  workingDirectory?: string | null;
  targetLanguage?: PromptOptimizerFillLanguage | null;
}

/**
 * Business Logic（为什么需要这个函数）:
 *   普通 Prompt 优化页需要双语结果，Workbench 小组件只需要设置页选择的单语结果。
 *
 * Code Logic（这个函数做什么）:
 *   归一化 invoke 参数：空目录和空语言转为 null，避免把空字符串传给 Rust 命令层。
 */
export function buildPromptOptimizerInvokeArgs(
  prompt: string,
  options: PromptOptimizerOptions = {},
): Record<string, unknown> {
  return {
    prompt,
    workingDirectory: options.workingDirectory?.trim() || null,
    targetLanguage: options.targetLanguage ?? null,
  };
}

export const promptOptimizerApi = {
  /** 优化原始 Prompt；不传 targetLanguage 时返回双语，Workbench 可传当前项目根目录和单语设置。 */
  optimize: (prompt: string, options: PromptOptimizerOptions = {}) =>
    invoke<PromptOptimizeResponse>(
      'optimize_prompt',
      buildPromptOptimizerInvokeArgs(prompt, options),
    ),
};
