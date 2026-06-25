import type { WorkbenchSession } from '../../lib/types';

interface VisibleTerminalSessionsInput {
  sessions: WorkbenchSession[];
  activeSessionId: string | null;
}

interface MountedTerminalSessionsInput {
  sessions: WorkbenchSession[];
}

/**
 * Business Logic（为什么需要这个函数）:
 *   工作台多终端布局中的 pane 位置应当稳定，用户点击终端只改变焦点，不应把终端挪到第一位。
 *
 * Code Logic（这个函数做什么）:
 *   按 startedAt 从早到晚排序；时间相同或无法解析时保持输入顺序，保证排序只由创建时间和原始顺序决定。
 */
function sortSessionsByCreatedOrder(sessions: WorkbenchSession[]): WorkbenchSession[] {
  return sessions
    .map((session, index) => ({
      session,
      index,
      startedAtMs: Date.parse(session.startedAt),
    }))
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.startedAtMs)
        ? left.startedAtMs
        : Number.POSITIVE_INFINITY;
      const rightTime = Number.isFinite(right.startedAtMs)
        ? right.startedAtMs
        : Number.POSITIVE_INFINITY;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return left.index - right.index;
    })
    .map((item) => item.session);
}

/**
 * Business Logic（为什么需要这个函数）:
 *   app tab 对应真实 tmux window；切换 tab 只应改变可见/交互层，不能销毁其他 xterm 实例，
 *   否则回切时 replay 原始终端流会重新执行历史控制序列，导致设备能力响应字符出现在 shell 中。
 *
 * Code Logic（这个函数做什么）:
 *   按创建时间返回所有 window，activeSessionId 不参与重排；调用方用 activeSessionId 控制可见性。
 */
export function visibleTerminalSessions(input: VisibleTerminalSessionsInput): WorkbenchSession[] {
  return sortSessionsByCreatedOrder(input.sessions);
}

/**
 * Business Logic（为什么需要这个函数）:
 *   切换 worktree 时也要保留其它 worktree 的 xterm 实例，避免回切时重新 replay 历史输出。
 *
 * Code Logic（这个函数做什么）:
 *   返回当前项目下所有 terminal window，并保持与 tab 列表一致的创建顺序；调用方用 active worktree/window 控制可见性。
 */
export function mountedTerminalSessions(input: MountedTerminalSessionsInput): WorkbenchSession[] {
  return sortSessionsByCreatedOrder(input.sessions);
}
