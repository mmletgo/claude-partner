/**
 * 速记本页面
 *
 * Business Logic（为什么需要这个页面）:
 *   用户在日常工作中需要快速记录临时想法、片段文字、待办事项等。
 *   速记本会自动保存到本机，关闭软件后再次打开仍能继续编辑，
 *   降低"忘记保存"和意外丢失内容的认知负担。
 *
 * Code Logic（这个页面做什么）:
 *   - 从 localStorage 初始化内容，并在内容变化时自动写回本地
 *   - 实时字符计数显示
 *   - 复制全部：navigator.clipboard.writeText
 *   - 清空：二次确认 modal 后清空状态和本地缓存
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '@/components/primitives';
import { CopyIcon, TrashIcon, XIcon } from '@/lib/icons';
import styles from './Scratchpad.module.css';

const SCRATCHPAD_STORAGE_KEY = 'cp-scratchpad-content';

/**
 * Business Logic（为什么需要）:
 *   速记本内容需要在应用关闭后继续保留，页面初始化时应恢复上次输入。
 *
 * Code Logic（做什么）:
 *   安全读取 localStorage；浏览器存储不可用时降级为空内容。
 */
function readStoredScratchpad(): string {
  try {
    return window.localStorage.getItem(SCRATCHPAD_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Business Logic（为什么需要）:
 *   用户输入后无需点击保存，内容应自动落到本机持久化存储。
 *
 * Code Logic（做什么）:
 *   非空内容写入 localStorage；空内容移除存储项，避免留下无意义缓存。
 */
function persistScratchpad(nextText: string): void {
  try {
    if (nextText.length === 0) {
      window.localStorage.removeItem(SCRATCHPAD_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SCRATCHPAD_STORAGE_KEY, nextText);
  } catch {
    // localStorage 可能因隐私模式或配额限制不可用，避免打断输入流程。
  }
}

/**
 * Business Logic（为什么需要）:
 *   用户需要一个可随手记录、自动保留内容的本机速记空间。
 *
 * Code Logic（做什么）:
 *   管理速记文本、字符计数、复制和清空确认，并通过 localStorage 自动持久化。
 */
export function Scratchpad() {
  const { t } = useTranslation(['scratchpad', 'common']);
  const [text, setText] = useState(readStoredScratchpad);
  const [pendingClear, setPendingClear] = useState(false);

  const charCount = text.length;

  useEffect(() => {
    persistScratchpad(text);
  }, [text]);

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

  return (
    <div className={styles.page}>
      {/* 页面头部 */}
      <header className={styles.pageHeader}>
        <span className={styles.eyebrow}>TOOLS</span>
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
        <span className={styles.charCount}>{t('scratchpad:charCount', { n: charCount })}</span>
      </div>

      {/* 编辑区 */}
      <textarea
        className={styles.editor}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('scratchpad:placeholder')}
        aria-label={t('scratchpad:contentAriaLabel')}
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
