import type { WorkbenchSession, WorkbenchWorktree } from '@/lib/types';
import {
  activeWorktreeRootPath,
  canCommitWorktree,
  sessionsForWorktree,
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

testSessionsForWorktree();
testActiveWorktreeRootPath();
testWorktreeStatusTone();
testCanCommitWorktreeIgnoresStaleCleanStatus();
