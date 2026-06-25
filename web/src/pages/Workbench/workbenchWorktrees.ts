import type { WorkbenchSession, WorkbenchWorktree } from '@/lib/types';

export type WorktreeTone = 'neutral' | 'warning' | 'danger';

/**
 * Business Logic（为什么需要这个函数）:
 *   方案 C 中 worktree 是 terminal window 之上的管理层，切换 worktree 后只应看到该工作区的 window。
 *
 * Code Logic（这个函数做什么）:
 *   按 worktreeId 过滤 session；主 worktree 兼容旧 session 的 null worktreeId。
 */
export function sessionsForWorktree(
  sessions: WorkbenchSession[],
  worktreeId: string | null,
): WorkbenchSession[] {
  if (!worktreeId) {
    return sessions.filter((session) => session.worktreeId === null);
  }
  if (worktreeId.endsWith(':main')) {
    return sessions.filter((session) => session.worktreeId === worktreeId || session.worktreeId === null);
  }
  return sessions.filter((session) => session.worktreeId === worktreeId);
}

/**
 * Business Logic（为什么需要这个函数）:
 *   文件树、终端 cwd 和 Prompt 优化都必须跟随 active worktree，而不是固定使用项目主路径。
 *
 * Code Logic（这个函数做什么）:
 *   active worktree 存在时返回 worktree.path；缺失时回退 projectPath。
 */
export function activeWorktreeRootPath(
  projectPath: string,
  activeWorktree: WorkbenchWorktree | null,
): string {
  return activeWorktree?.path ?? projectPath;
}

/**
 * Business Logic（为什么需要这个函数）:
 *   worktree strip 需要用稳定 tone 让用户快速识别可合并、脏工作区和冲突状态。
 *
 * Code Logic（这个函数做什么）:
 *   conflict 映射 danger；dirty/ahead/behind 映射 warning；clean 映射 neutral。
 */
export function worktreeStatusTone(worktree: WorkbenchWorktree): WorktreeTone {
  if (worktree.status.conflicts > 0) return 'danger';
  if (!worktree.status.clean || worktree.status.ahead > 0 || worktree.status.behind > 0) {
    return 'warning';
  }
  return 'neutral';
}

/**
 * Business Logic（为什么需要这个函数）:
 *   Git 状态来自轮询快照，用户在终端里改文件后快照可能暂时仍是 clean；Commit 点击应交给后端实时判断。
 *
 * Code Logic（这个函数做什么）:
 *   只检查是否有 active worktree 以及是否已有 worktree 操作进行，不依赖可能过期的 clean 状态。
 */
export function canCommitWorktree(
  activeWorktree: WorkbenchWorktree | null,
  worktreeBusy: string | null,
): boolean {
  return activeWorktree !== null && worktreeBusy === null;
}

/**
 * Business Logic（为什么需要这个函数）:
 *   Git 历史 tab 中每条提交需要紧凑时间标识，便于在窄侧栏内扫描最近提交。
 *
 * Code Logic（这个函数做什么）:
 *   1 分钟内显示 now，1 小时内显示 Xm，24 小时内显示 Xh，更早显示 YYYY-MM-DD。
 */
export function formatCommitRelativeTime(
  authoredAt: string,
  emptyValue: string,
  now = new Date(),
): string {
  const date = new Date(authoredAt);
  if (Number.isNaN(date.getTime())) return emptyValue;
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return date.toISOString().slice(0, 10);
}

/**
 * Business Logic（为什么需要这个函数）:
 *   Git 历史 tab 需要区分空提交历史与加载失败，显示不同空态。
 *
 * Code Logic（这个函数做什么）:
 *   对任意包含 length 的数组式列表做非空判断，便于测试和 UI 复用。
 */
export function hasGitHistory(commits: Array<unknown>): boolean {
  return commits.length > 0;
}
