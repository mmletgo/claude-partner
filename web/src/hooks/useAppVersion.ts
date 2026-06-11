/**
 * useAppVersion Hook
 *
 * Business Logic（为什么需要这个 hook）:
 *   多个界面（AppShell 页脚、DesignSystem 设计系统页等）需要展示当前应用版本号。
 *   版本号以后端 __init__.py 的 __version__ 为唯一权威来源，统一通过此 hook
 *   从 /api/version 获取，既避免各组件重复编写 useState/useEffect 样板，也避免
 *   前端硬编码版本号导致发版时漏改、与实际版本不一致。
 *
 * Code Logic（这个 hook 做什么）:
 *   - 组件挂载时调用一次 configApi.version()，返回后端 version 字符串
 *   - 请求未完成或失败时返回 null，由调用方自行 fallback 显示占位符（如 —）
 *   - 通过 cancelled 标志避免组件卸载后再 setState
 */
import { useEffect, useState } from 'react';
import { configApi } from '@/api/config';

export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    configApi
      .version()
      .then((info) => {
        if (!cancelled) {
          setVersion(info.version);
        }
      })
      .catch(() => {
        // 获取失败保持 null，调用方显示占位符
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}
