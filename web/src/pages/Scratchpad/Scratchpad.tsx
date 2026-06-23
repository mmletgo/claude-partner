/**
 * 速记本页面
 *
 * Business Logic（为什么需要这个页面）:
 *   用户在日常工作中需要快速记录临时想法、片段文字、待办事项等。
 *   速记本会自动保存到本机，关闭软件后再次打开仍能继续编辑，
 *   降低"忘记保存"和意外丢失内容的认知负担。
 *
 * Code Logic（这个页面做什么）:
 *   - 从 Rust/SQLite 初始化单例内容，并在内容变化后 debounce 自动保存
 *   - 实时字符计数显示
 *   - 复制全部：navigator.clipboard.writeText
 *   - 清空：二次确认 modal 后写入空内容
 *   - 同步：同时调用 scratchpadApi.syncLan 与 configApi.triggerCloudSync 后刷新内容
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { configApi } from '@/api/config';
import { scratchpadApi } from '@/api/scratchpad';
import { Button, Card } from '@/components/primitives';
import { CopyIcon, SyncIcon, TrashIcon, XIcon } from '@/lib/icons';
import styles from './Scratchpad.module.css';

const AUTOSAVE_DELAY_MS = 500;

/**
 * Business Logic（为什么需要）:
 *   用户需要一个可随手记录、自动保留内容的本机速记空间。
 *
 * Code Logic（做什么）:
 *   管理速记文本、加载/保存/同步状态、字符计数、复制和清空确认；
 *   所有持久化与同步都通过 Tauri invoke 交给 Rust 后端。
 */
export function Scratchpad() {
  const { t } = useTranslation(['scratchpad', 'common']);
  const [text, setText] = useState('');
  const [pendingClear, setPendingClear] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const skipNextSaveRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  const charCount = text.length;

  const applyServerContent = useCallback((content: string) => {
    setText((current) => {
      if (current !== content) {
        skipNextSaveRef.current = true;
      }
      return content;
    });
    loadedRef.current = true;
  }, []);

  const loadScratchpad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const scratchpad = await scratchpadApi.get();
      applyServerContent(scratchpad.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('scratchpad:loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [applyServerContent, t]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadScratchpad();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadScratchpad]);

  useEffect(() => {
    if (!loadedRef.current) return undefined;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return undefined;
    }
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    setSaving(true);
    setStatus(null);
    saveTimerRef.current = window.setTimeout(() => {
      void scratchpadApi
        .update(text)
        .then((scratchpad) => {
          setStatus(t('scratchpad:savedAt', { time: new Date(scratchpad.updatedAt).toLocaleTimeString() }));
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : t('scratchpad:saveFailed'));
        })
        .finally(() => {
          setSaving(false);
          saveTimerRef.current = null;
        });
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [text, t]);

  const savePendingNow = useCallback(async () => {
    if (!loadedRef.current || saveTimerRef.current === null) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    setSaving(true);
    try {
      const scratchpad = await scratchpadApi.update(text);
      setStatus(
        t('scratchpad:savedAt', {
          time: new Date(scratchpad.updatedAt).toLocaleTimeString(),
        }),
      );
    } finally {
      setSaving(false);
    }
  }, [text, t]);

  const handleCopyAll = useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 静默失败
    }
  }, [text]);

  const handleClearRequest = useCallback(() => {
    if (!text) return;
    setPendingClear(true);
  }, [text]);

  const confirmClear = useCallback(() => {
    setText('');
    setPendingClear(false);
  }, []);

  const cancelClear = useCallback(() => {
    setPendingClear(false);
  }, []);

  const refreshAfterSync = useCallback(async () => {
    const scratchpad = await scratchpadApi.get();
    applyServerContent(scratchpad.content);
  }, [applyServerContent]);

  /**
   * Business Logic（为什么需要）:
   *   用户只需要一个同步入口，点击后本机速记本应同时同步到局域网设备与 GitHub 云端。
   *
   * Code Logic（做什么）:
   *   先保存待写入内容，再并发触发局域网同步和 GitHub 云端同步；
   *   两个同步结果用 allSettled 汇总，避免其中一路失败导致另一路没有触发。
   */
  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setStatus(null);
    try {
      await savePendingNow();
      const [lanResult, cloudResult] = await Promise.allSettled([
        scratchpadApi.syncLan(),
        configApi.triggerCloudSync(),
      ]);

      await refreshAfterSync();

      const statusParts: string[] = [];
      const failureParts: string[] = [];

      if (lanResult.status === 'fulfilled') {
        statusParts.push(t('scratchpad:lanSyncDone', { count: lanResult.value.synced }));
      } else {
        const reason = lanResult.reason instanceof Error ? lanResult.reason.message : t('scratchpad:lanSyncFailed');
        statusParts.push(t('scratchpad:lanSyncFailed'));
        failureParts.push(t('scratchpad:lanSyncFailedWithReason', { reason }));
      }

      if (cloudResult.status === 'fulfilled' && cloudResult.value.ok) {
        statusParts.push(t('scratchpad:cloudSyncDone', { note: cloudResult.value.note }));
      } else if (cloudResult.status === 'fulfilled') {
        statusParts.push(t('scratchpad:cloudSyncFailed'));
        failureParts.push(t('scratchpad:cloudSyncFailedWithReason', { reason: cloudResult.value.note }));
      } else {
        const reason = cloudResult.reason instanceof Error ? cloudResult.reason.message : t('scratchpad:cloudSyncFailed');
        statusParts.push(t('scratchpad:cloudSyncFailed'));
        failureParts.push(t('scratchpad:cloudSyncFailedWithReason', { reason }));
      }

      setStatus(statusParts.join(t('scratchpad:syncSummarySeparator')));
      if (failureParts.length > 0) {
        setError(t('scratchpad:syncFailed', { detail: failureParts.join(t('scratchpad:syncFailureSeparator')) }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('scratchpad:syncFailed', { detail: t('scratchpad:saveFailed') }));
    } finally {
      setSyncing(false);
    }
  }, [refreshAfterSync, savePendingNow, t]);

  return (
    <div className={styles.page}>
      {/* 页面头部 */}
      <header className={styles.pageHeader}>
        <span className={styles.eyebrow}>{t('scratchpad:eyebrow')}</span>
        <h1 className={styles.title}>{t('scratchpad:title')}</h1>
        <p className={styles.lead}>{t('scratchpad:desc')}</p>
      </header>

      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <Button variant="primary" size="sm" icon={<CopyIcon />} onClick={handleCopyAll}>
          {t('scratchpad:copyAll')}
        </Button>
        <Button variant="secondary" size="sm" icon={<TrashIcon />} onClick={handleClearRequest}>
          {t('scratchpad:clear')}
        </Button>
        <Button variant="secondary" size="sm" icon={<SyncIcon />} loading={syncing} onClick={handleSync}>
          {syncing ? t('scratchpad:syncing') : t('scratchpad:syncAll')}
        </Button>
        <span className={styles.charCount}>{t('scratchpad:charCount', { n: charCount })}</span>
      </div>

      <div className={styles.statusRow} aria-live="polite">
        {loading ? <span>{t('scratchpad:loading')}</span> : null}
        {!loading && saving ? <span>{t('scratchpad:saving')}</span> : null}
        {!loading && !saving && status ? <span>{status}</span> : null}
        {error ? <span className={styles.error}>{error}</span> : null}
      </div>

      {/* 编辑区 */}
      <textarea
        className={styles.editor}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('scratchpad:placeholder')}
        aria-label={t('scratchpad:contentAriaLabel')}
        disabled={loading}
      />

      {/* 清空确认弹层 */}
      {pendingClear ? (
        <div className={styles.modalMask} role="dialog" aria-modal="true" aria-labelledby="clear-title">
          <Card variant="elevated" className={styles.modal}>
            <h3 id="clear-title" className={styles.modalTitle}>
              {t('scratchpad:clearConfirmTitle')}
            </h3>
            <p className={styles.modalText}>{t('scratchpad:clearConfirmText')}</p>
            <div className={styles.modalActions}>
              <Button variant="secondary" size="sm" icon={<XIcon />} onClick={cancelClear}>
                {t('common:action.cancel')}
              </Button>
              <Button variant="danger" size="sm" icon={<TrashIcon />} onClick={confirmClear}>
                {t('scratchpad:clear')}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
