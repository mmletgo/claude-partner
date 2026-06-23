import type { ClaudeCodeAsset } from '@/lib/types';

/**
 * 生成远端资产在选择器中的稳定 key。
 *
 * Business Logic（为什么需要）:
 *   用户从局域网设备挑选 Claude Code assets 时，选择状态需要在列表筛选和重渲染后保持稳定。
 *
 * Code Logic（做什么）:
 *   用资产类型和资产 id 拼出唯一字符串，供列表 key 与 selectedKeys 集合共用。
 */
export function remoteAssetKey(asset: ClaudeCodeAsset): string {
  return `${asset.kind}:${asset.id}`;
}
