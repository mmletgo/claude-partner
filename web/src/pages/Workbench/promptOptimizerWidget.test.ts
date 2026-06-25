import type { WorkbenchSession } from '../../lib/types';
import {
  canFillPromptIntoTerminal,
  promptOptimizerInsertPayload,
  selectPromptOptimizerInsertText,
} from './promptOptimizerWidget';

/**
 * Business Logic（为什么需要这个函数）:
 *   Workbench prompt 优化小组件测试需要构造不同运行状态的终端会话。
 *
 * Code Logic（这个函数做什么）:
 *   接收 status，返回满足 helper 测试所需字段的 WorkbenchSession。
 */
function session(status: WorkbenchSession['status']): WorkbenchSession {
  return {
    id: 'session-1',
    projectId: 'project-1',
    name: 'Terminal 1',
    command: 'claude',
    status,
    cols: 120,
    rows: 30,
    startedAt: '2026-06-24T09:00:00.000Z',
    exitedAt: null,
    exitCode: null,
    supportsPanes: true,
    paneCount: 1,
  };
}

/**
 * Business Logic（为什么需要这个函数）:
 *   纯函数测试不引入测试框架，需要在失败时给出清晰上下文。
 *
 * Code Logic（这个函数做什么）:
 *   对比 JSON 序列化后的实际值和期望值，不一致则抛出 Error。
 */
function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assertEqual(
  selectPromptOptimizerInsertText({
    optimizedZh: '中文结果',
    optimizedEn: 'English result',
  }),
  '中文结果',
  'selects Chinese optimized result first',
);

assertEqual(
  selectPromptOptimizerInsertText({
    optimizedZh: '   ',
    optimizedEn: 'English result',
  }),
  'English result',
  'falls back to English optimized result',
);

assertEqual(canFillPromptIntoTerminal(session('running')), true, 'running session can fill');
assertEqual(canFillPromptIntoTerminal(null), false, 'missing session cannot fill');
assertEqual(canFillPromptIntoTerminal(session('exited')), false, 'non-running session cannot fill');

assertEqual(
  promptOptimizerInsertPayload({
    optimizedZh: '中文结果',
    optimizedEn: 'English result',
  }),
  '中文结果',
  'insert payload does not append Enter',
);

assertEqual(
  promptOptimizerInsertPayload({
    optimizedZh: '中文结果\n',
    optimizedEn: '',
  }),
  '中文结果\n',
  'insert payload preserves existing trailing newline',
);

console.log('promptOptimizerWidget.test.ts passed');
