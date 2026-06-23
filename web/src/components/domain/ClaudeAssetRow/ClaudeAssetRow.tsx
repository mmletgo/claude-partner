/**
 * ClaudeAssetRow 业务组件 - Claude Code asset 列表行
 *
 * Business Logic（为什么需要这个组件）:
 *   Claude Code 管理页需要以统一结构展示 skill / command / plugin / MCP 的状态、来源、路径、
 *   警告与操作按钮，便于用户快速扫描和管理。
 *
 * Code Logic（这个组件做什么）:
 *   接收一个 ClaudeCodeAsset DTO，渲染元信息、状态 Pill、警告列表，并把启停/卸载操作委托给父页面。
 */

import { useTranslation } from 'react-i18next';
import { Button, Pill } from '@/components/primitives';
import { AlertIcon, PlayIcon, PauseIcon, TrashIcon } from '@/lib/icons';
import { formatBytes, formatRelativeTime } from '@/lib/format';
import type { ClaudeCodeAsset } from '@/lib/types';
import styles from './ClaudeAssetRow.module.css';

export interface ClaudeAssetRowProps {
  asset: ClaudeCodeAsset;
  busy?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onToggle?: (asset: ClaudeCodeAsset) => void;
  onRemove?: (asset: ClaudeCodeAsset) => void;
  onSelect?: (asset: ClaudeCodeAsset, checked: boolean) => void;
}

/**
 * 渲染单个 Claude Code asset 行。
 */
export function ClaudeAssetRow({
  asset,
  busy = false,
  selected = false,
  selectable = false,
  onToggle,
  onRemove,
  onSelect,
}: ClaudeAssetRowProps) {
  const { t } = useTranslation(['claudeCodeAssets']);
  const updated = asset.updatedAt ? formatRelativeTime(asset.updatedAt) : null;

  return (
    <div className={styles.row} data-disabled={!asset.enabled || undefined}>
      {selectable ? (
        <label className={styles.checkWrap} aria-label={t('claudeCodeAssets:selectAsset', { name: asset.name })}>
          <input
            type="checkbox"
            checked={selected}
            disabled={!asset.canExport}
            onChange={(e) => onSelect?.(asset, e.currentTarget.checked)}
          />
        </label>
      ) : null}
      <div className={styles.main}>
        <div className={styles.titleLine}>
          <span className={styles.name}>{asset.name}</span>
          <Pill tone="neutral">{t(`claudeCodeAssets:kinds.${asset.kind}`)}</Pill>
          <Pill tone={asset.enabled ? 'success' : 'neutral'} dot>
            {asset.enabled ? t('claudeCodeAssets:enabled') : t('claudeCodeAssets:disabled')}
          </Pill>
        </div>
        {asset.description ? <p className={styles.description}>{asset.description}</p> : null}
        <div className={styles.metaLine}>
          <span>{asset.source}</span>
          <span>{asset.scope}</span>
          {asset.version ? <span>{asset.version}</span> : null}
          {typeof asset.sizeBytes === 'number' ? <span>{formatBytes(asset.sizeBytes)}</span> : null}
          {updated ? <span>{updated}</span> : null}
        </div>
        {asset.path ? <div className={styles.path}>{asset.path}</div> : null}
        {asset.warnings.length > 0 ? (
          <div className={styles.warnings}>
            {asset.warnings.map((warning) => (
              <span key={warning} className={styles.warning}>
                <AlertIcon size={14} />
                {warning}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {!selectable ? (
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="sm"
            icon={asset.enabled ? <PauseIcon /> : <PlayIcon />}
            disabled={!asset.canEnable}
            loading={busy}
            onClick={() => onToggle?.(asset)}
          >
            {asset.enabled ? t('claudeCodeAssets:disable') : t('claudeCodeAssets:enable')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={<TrashIcon />}
            disabled={!asset.canUninstall}
            loading={busy}
            onClick={() => onRemove?.(asset)}
          >
            {t('claudeCodeAssets:uninstall')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
