import type { WorkbenchSession } from './types';

export interface WorkbenchProjectSessionStats {
  windowCount: number;
  paneCount: number;
}

export const EMPTY_PROJECT_SESSION_STATS: WorkbenchProjectSessionStats = {
  windowCount: 0,
  paneCount: 0,
};

/**
 * Business Logic（为什么需要这个函数）:
 *   项目卡片统计应在后端临时缺少 paneCount 或返回异常值时保持可读，不出现 NaN。
 *
 * Code Logic（这个函数做什么）:
 *   将非有限或小于 0 的 paneCount 归一化为 1，正常值按非负整数参与累计。
 */
function normalizedPaneCount(session: WorkbenchSession): number {
  if (!Number.isFinite(session.paneCount) || session.paneCount < 0) return 1;
  return Math.floor(session.paneCount);
}

/**
 * Business Logic（为什么需要这个函数）:
 *   项目列表卡片需要显示每个项目已打开的 terminal window 数和 pane 总数。
 *
 * Code Logic（这个函数做什么）:
 *   接收会话列表，按 projectId 聚合 windowCount，并把每个 window 的 paneCount 累加为 paneCount。
 */
export function sessionStatsByProject(
  sessions: WorkbenchSession[],
): Record<string, WorkbenchProjectSessionStats> {
  return sessions.reduce<Record<string, WorkbenchProjectSessionStats>>((stats, session) => {
    const current = stats[session.projectId] ?? { windowCount: 0, paneCount: 0 };
    stats[session.projectId] = {
      windowCount: current.windowCount + 1,
      paneCount: current.paneCount + normalizedPaneCount(session),
    };
    return stats;
  }, {});
}

/**
 * Business Logic（为什么需要这个函数）:
 *   单个项目卡片需要在没有任何终端时显示 0 window / 0 pane，而不是回退到旧的进入文案。
 *
 * Code Logic（这个函数做什么）:
 *   复用 sessionStatsByProject 的聚合结果，返回目标 projectId 的统计；缺失时返回零值统计。
 */
export function projectSessionStats(
  sessions: WorkbenchSession[],
  projectId: string,
): WorkbenchProjectSessionStats {
  return sessionStatsByProject(sessions)[projectId] ?? EMPTY_PROJECT_SESSION_STATS;
}
