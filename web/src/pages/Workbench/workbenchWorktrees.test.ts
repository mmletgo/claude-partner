import type { WorkbenchGitCommit, WorkbenchSession, WorkbenchWorktree } from '@/lib/types';
import {
  activeWorktreeRootPath,
  buildGitGraphRows,
  canCommitWorktree,
  canMergeWorktree,
  canPushWorktree,
  canRemoveWorktree,
  formatCommitRelativeTime,
  hasGitHistory,
  sessionsForWorktree,
  worktreeChangeCount,
  worktreeStatusTone,
} from './workbenchWorktrees';

const baseSession: WorkbenchSession = {
  id: 's1',
  projectId: 'p1',
  worktreeId: null,
  cwd: '/repo',
  name: 'main',
  command: '/bin/zsh',
  status: 'running',
  cols: 100,
  rows: 30,
  startedAt: '2026-06-25T00:00:00Z',
  exitedAt: null,
  exitCode: null,
  supportsPanes: true,
  paneCount: 1,
};

const mainWorktree: WorkbenchWorktree = {
  id: 'main',
  projectId: 'p1',
  name: 'main',
  branch: 'main',
  baseBranch: null,
  path: '/repo',
  isMain: true,
  status: {
    branch: 'main',
    changed: 0,
    ahead: 0,
    behind: 0,
    conflicts: 0,
    clean: true,
    canPush: true,
  },
  createdAt: '2026-06-25T00:00:00Z',
  updatedAt: '2026-06-25T00:00:00Z',
};

/**
 * Business Logic（为什么需要这个测试）:
 *   方案 C 下 worktree 是 window 之上的管理层，切换 worktree 后只能显示该 worktree 的 windows。
 *
 * Code Logic（这个测试做什么）:
 *   构造 main/feature 两个 session，断言按 active worktree 过滤。
 */
function testSessionsForWorktree(): void {
  const sessions: WorkbenchSession[] = [
    baseSession,
    { ...baseSession, id: 's2', worktreeId: 'feature', cwd: '/repo-feature' },
  ];

  const filtered = sessionsForWorktree(sessions, 'feature');

  if (filtered.length !== 1 || filtered[0]?.id !== 's2') {
    throw new Error(`expected feature session only, got ${JSON.stringify(filtered)}`);
  }
}

/**
 * Business Logic（为什么需要这个测试）:
 *   文件树和 Prompt 优化必须跟随 active worktree root，而不是永远使用主项目路径。
 *
 * Code Logic（这个测试做什么）:
 *   有 active worktree 时返回 worktree.path，缺失时回退 project path。
 */
function testActiveWorktreeRootPath(): void {
  const feature = { ...mainWorktree, id: 'feature', path: '/repo-feature', isMain: false };

  if (activeWorktreeRootPath('/repo', feature) !== '/repo-feature') {
    throw new Error('expected active worktree path');
  }
  if (activeWorktreeRootPath('/repo', null) !== '/repo') {
    throw new Error('expected project path fallback');
  }
}

/**
 * Business Logic（为什么需要这个测试）:
 *   worktree strip 需要用紧凑 tone 呈现 clean/dirty/conflict，帮助用户快速判断是否可合并。
 *
 * Code Logic（这个测试做什么）:
 *   根据 status 摘要断言 tone 映射。
 */
function testWorktreeStatusTone(): void {
  if (worktreeStatusTone(mainWorktree) !== 'neutral') {
    throw new Error('expected clean worktree to be neutral');
  }
  if (worktreeStatusTone({ ...mainWorktree, status: { ...mainWorktree.status, changed: 2, clean: false } }) !== 'warning') {
    throw new Error('expected dirty worktree to be warning');
  }
  if (worktreeStatusTone({ ...mainWorktree, status: { ...mainWorktree.status, conflicts: 1, clean: false } }) !== 'danger') {
    throw new Error('expected conflict worktree to be danger');
  }
}

/**
 * Business Logic（为什么需要这个测试）:
 *   Workbench 的 Git 状态可能是旧快照；Commit 按钮应允许点击，由后端实时 stage 并判断是否有改动。
 *
 * Code Logic（这个测试做什么）:
 *   断言 clean worktree 在没有其他 worktree 操作进行时仍可提交；busy 或无 active worktree 时不可提交。
 */
function testCanCommitWorktreeIgnoresStaleCleanStatus(): void {
  if (!canCommitWorktree(mainWorktree, null)) {
    throw new Error('expected clean snapshot to still allow commit click');
  }
  if (canCommitWorktree(mainWorktree, 'push')) {
    throw new Error('expected busy worktree actions to block commit');
  }
  if (canCommitWorktree(null, null)) {
    throw new Error('expected missing worktree to block commit');
  }
}

/**
 * Business Logic（为什么需要这个测试）:
 *   Git 历史 tab 内的工具条承载当前 worktree 的 Git 操作，需要统一判断按钮可用性。
 *
 * Code Logic（这个测试做什么）:
 *   断言 commit/push/merge/remove 的可用性与 active worktree、主 worktree 和 busy 状态一致。
 */
function testGitHistoryActionAvailability(): void {
  const feature = { ...mainWorktree, id: 'feature', isMain: false, branch: 'feature/a' };
  const localOnlyFeature = {
    ...feature,
    status: { ...feature.status, canPush: false },
  };

  if (!canPushWorktree(feature, null)) {
    throw new Error('expected feature branch to allow push');
  }
  if (canPushWorktree(localOnlyFeature, null)) {
    throw new Error('expected local-only branch without remote to block push');
  }
  if (canPushWorktree({ ...feature, branch: null }, null)) {
    throw new Error('expected missing branch to block push');
  }
  if (!canMergeWorktree(feature, null)) {
    throw new Error('expected non-main worktree to allow merge');
  }
  if (canMergeWorktree(mainWorktree, null)) {
    throw new Error('expected main worktree to block merge');
  }
  if (canMergeWorktree({ ...feature, status: { ...feature.status, changed: 1, clean: false } }, null)) {
    throw new Error('expected dirty worktree to block merge');
  }
  if (!canRemoveWorktree(feature, null)) {
    throw new Error('expected non-main worktree to allow remove');
  }
  if (canRemoveWorktree(feature, 'push')) {
    throw new Error('expected busy state to block remove');
  }
}

/**
 * Business Logic（为什么需要这个测试）:
 *   Git 历史 tab 顶部需要显示当前 worktree 的改动数，代替 worktree 顶部主工具区的状态提示。
 *
 * Code Logic（这个测试做什么）:
 *   断言 helper 提取 changed 数量，缺少 active worktree 时回退 0。
 */
function testWorktreeChangeCount(): void {
  if (worktreeChangeCount({ ...mainWorktree, status: { ...mainWorktree.status, changed: 3 } }) !== 3) {
    throw new Error('expected changed count from active worktree');
  }
  if (worktreeChangeCount(null) !== 0) {
    throw new Error('expected missing worktree to have no changes');
  }
}

/**
 * Business Logic（为什么需要这个测试）:
 *   Git 历史 tab 需要用紧凑相对时间帮助用户快速扫提交顺序。
 *
 * Code Logic（这个测试做什么）:
 *   用固定 now 断言分钟、小时和日期兜底格式。
 */
function testFormatCommitRelativeTime(): void {
  const now = new Date('2026-06-25T12:00:00Z');
  if (formatCommitRelativeTime('2026-06-25T11:58:00Z', '—', now) !== '2m') {
    throw new Error('expected minutes relative time');
  }
  if (formatCommitRelativeTime('2026-06-25T09:00:00Z', '—', now) !== '3h') {
    throw new Error('expected hours relative time');
  }
  if (formatCommitRelativeTime('2026-06-20T12:00:00Z', '—', now) !== '2026-06-20') {
    throw new Error('expected date fallback');
  }
}

/**
 * Business Logic（为什么需要这个测试）:
 *   Git 历史 tab 需要区分有历史和空历史，避免空列表显示成加载失败。
 *
 * Code Logic（这个测试做什么）:
 *   对空数组和含提交数组做布尔判断。
 */
function testHasGitHistory(): void {
  if (hasGitHistory([])) {
    throw new Error('expected empty history to be false');
  }
  if (!hasGitHistory([{ hash: 'h' }])) {
    throw new Error('expected non-empty history to be true');
  }
}

/**
 * Business Logic（为什么需要这个测试）:
 *   Git 历史需要像 VS Code 一样按提交 DAG 绘制分支/合并线，而不是普通线性列表。
 *
 * Code Logic（这个测试做什么）:
 *   构造一个 merge commit，断言 graph helper 给 merge 行分配两个 parent lane，分支行在第二 lane。
 */
function testBuildGitGraphRowsForMergeHistory(): void {
  const commits: WorkbenchGitCommit[] = [
    {
      hash: 'a',
      shortHash: 'a',
      parentHashes: ['b', 'c'],
      authorName: 'Alice',
      authorEmail: 'a@example.com',
      authoredAt: '2026-06-25T12:00:00Z',
      summary: 'Merge branch feature',
      refs: [],
    },
    {
      hash: 'b',
      shortHash: 'b',
      parentHashes: ['d'],
      authorName: 'Alice',
      authorEmail: 'a@example.com',
      authoredAt: '2026-06-25T11:00:00Z',
      summary: 'main work',
      refs: [{ name: 'main', fullName: 'refs/heads/main', kind: 'local', remote: null, isHead: true }],
    },
    {
      hash: 'c',
      shortHash: 'c',
      parentHashes: ['d'],
      authorName: 'Bob',
      authorEmail: 'b@example.com',
      authoredAt: '2026-06-25T10:00:00Z',
      summary: 'feature work',
      refs: [{ name: 'origin/main', fullName: 'refs/remotes/origin/main', kind: 'remote', remote: 'origin', isHead: false }],
    },
    {
      hash: 'd',
      shortHash: 'd',
      parentHashes: [],
      authorName: 'Alice',
      authorEmail: 'a@example.com',
      authoredAt: '2026-06-25T09:00:00Z',
      summary: 'base',
      refs: [],
    },
  ];

  const rows = buildGitGraphRows(commits);

  if (rows[0]?.lane !== 0 || rows[0]?.parentLanes.join(',') !== '0,1') {
    throw new Error(`expected merge parents on lanes 0,1, got ${JSON.stringify(rows[0])}`);
  }
  if (rows[2]?.lane !== 1 || rows[2]?.parentLanes.join(',') !== '0') {
    throw new Error(`expected side branch to merge back to lane 0, got ${JSON.stringify(rows[2])}`);
  }
}

testSessionsForWorktree();
testActiveWorktreeRootPath();
testWorktreeStatusTone();
testCanCommitWorktreeIgnoresStaleCleanStatus();
testGitHistoryActionAvailability();
testWorktreeChangeCount();
testFormatCommitRelativeTime();
testHasGitHistory();
testBuildGitGraphRowsForMergeHistory();
