import { buildPromptOptimizerInvokeArgs } from './promptOptimizer';

/**
 * Business Logic（为什么需要这个函数）:
 *   Prompt 优化 API 测试需要清晰断言参数是否按设置语种传给后端。
 *
 * Code Logic（这个函数做什么）:
 *   condition 为 false 时抛错，让 tsx 测试进程以非零状态退出。
 */
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const args = buildPromptOptimizerInvokeArgs('修复问题', {
  workingDirectory: '/Users/hans/project/Pando',
  targetLanguage: 'zh',
});

assert(
  JSON.stringify(args) ===
    JSON.stringify({
      prompt: '修复问题',
      workingDirectory: '/Users/hans/project/Pando',
      targetLanguage: 'zh',
    }),
  'optimize should pass targetLanguage to backend',
);

console.log('promptOptimizer.test.ts passed');
