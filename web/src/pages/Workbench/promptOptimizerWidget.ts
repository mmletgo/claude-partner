/**
 * Workbench Prompt 优化小组件状态 helper。
 *
 * Business Logic（为什么需要这个模块）:
 *   Workbench 内嵌 Prompt 优化后，需要把优化结果安全填入当前活动终端；
 *   选择填入文本、按钮可用性和写入 payload 必须独立测试，避免 UI 改动破坏终端输入规则。
 *
 * Code Logic（这个模块做什么）:
 *   提供无 React 依赖的纯函数：中文结果优先、英文结果兜底、仅 running session 可填入，
 *   并保持写入文本原样，不主动追加 Enter。
 */

import type { PromptOptimizeResponse, WorkbenchSession } from '../../lib/types';

/**
 * Business Logic（为什么需要这个函数）:
 *   用户点击“一键填入终端”时默认应使用中文优化结果；中文为空时仍可使用英文结果。
 *
 * Code Logic（这个函数做什么）:
 *   接收优化结果 DTO，先 trim 检查中文结果是否有内容，有则返回原始中文字符串；
 *   否则检查英文结果并返回原始英文字符串；两者都为空时返回空字符串。
 */
export function selectPromptOptimizerInsertText(result: PromptOptimizeResponse): string {
  if (result.optimizedZh.trim().length > 0) return result.optimizedZh;
  if (result.optimizedEn.trim().length > 0) return result.optimizedEn;
  return '';
}

/**
 * Business Logic（为什么需要这个函数）:
 *   只有当前活动终端真实运行时，填入按钮才应可用，避免写入已退出或不存在的 session。
 *
 * Code Logic（这个函数做什么）:
 *   检查 activeSession 是否存在且 status 为 running。
 */
export function canFillPromptIntoTerminal(activeSession: WorkbenchSession | null): boolean {
  return activeSession?.status === 'running';
}

/**
 * Business Logic（为什么需要这个函数）:
 *   Workbench 填入终端只应插入文本，不应代替用户执行命令。
 *
 * Code Logic（这个函数做什么）:
 *   复用结果选择规则并原样返回待写入 PTY 的 payload，不追加回车；
 *   若原优化结果本身包含换行，则完整保留。
 */
export function promptOptimizerInsertPayload(result: PromptOptimizeResponse): string {
  return selectPromptOptimizerInsertText(result);
}
