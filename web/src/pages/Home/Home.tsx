/**
 * Home 首页 - GitHub 周热门项目
 *
 * Business Logic（为什么需要这个页面）:
 *   用户打开应用后第一眼看到 GitHub 本周社区热门项目，快速了解开源趋势；
 *   每个项目同时展示 GitHub 原始简介和当前界面语言对应的 Claude 解说。
 *
 * Code Logic（这个页面做什么）:
 *   - 调用 githubTrendingApi.list() 获取后端按天缓存的 GitHub Trending Weekly Top 25
 *   - 根据 i18n 当前语言把 repo explanation 切换为中文/英文
 *   - loading/error/empty/stale/AI failed 状态分别渲染
 *   - 使用 tauri-plugin-opener 把仓库 URL 交给系统浏览器打开
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button, Pill } from '@/components/primitives';
import { GithubRepoCard } from '@/components/domain';
import { AlertIcon, InfoIcon, RefreshIcon } from '@/lib/icons';
import { githubTrendingApi } from '@/api/githubTrending';
import type { AppLanguage } from '@/i18n';
import type { GithubTrendingResponse } from '@/lib/types';
import styles from './Home.module.css';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * 将 i18next 的语言字符串归一化为应用支持语言。
 */
function normalizeLanguage(language: string): AppLanguage {
  return language === 'zh' ? 'zh' : 'en';
}

/**
 * 格式化 ISO 时间为本地短日期时间。
 */
function formatDateTime(iso: string, language: AppLanguage): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Home 页面根组件。
 */
export function Home() {
  const { t, i18n } = useTranslation(['home']);
  const language = normalizeLanguage(i18n.language);
  const [state, setState] = useState<LoadState>('loading');
  const [response, setResponse] = useState<GithubTrendingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const loadTrending = useCallback(async () => {
    setState('loading');
    setError(null);
    setOpenError(null);
    try {
      const data = await githubTrendingApi.list();
      setResponse(data);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('home:unknownError'));
      setState('error');
    }
  }, [t]);

  useEffect(() => {
    void loadTrending();
  }, [loadTrending]);

  const handleOpen = useCallback(
    (url: string) => {
      setOpenError(null);
      void openUrl(url).catch((err: unknown) => {
        setOpenError(err instanceof Error ? err.message : t('home:openFailed'));
      });
    },
    [t],
  );

  const meta = useMemo(() => {
    if (!response) return [];
    return [
      {
        label: t('home:fetchedAt'),
        value: formatDateTime(response.fetchedAt, language),
      },
      {
        label: t('home:expiresAt'),
        value: formatDateTime(response.expiresAt, language),
      },
      {
        label: t('home:source'),
        value: response.fromCache ? t('home:cache') : t('home:live'),
      },
    ];
  }, [language, response, t]);

  const aiTone = response?.aiStatus === 'failed' ? 'warn' : response?.aiStatus === 'ready' ? 'success' : 'neutral';
  const aiStatusText = response?.aiStatus === 'ready'
    ? t('home:aiStatus.ready')
    : response?.aiStatus === 'failed'
      ? t('home:aiStatus.failed')
      : t('home:aiStatus.disabled');

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            {t('home:eyebrow')}
          </div>
          <div className={styles.titleRow}>
            <div className={styles.titleBlock}>
              <h1 className={styles.title}>{t('home:title')}</h1>
              <p className={styles.lede}>{t('home:lede')}</p>
            </div>
            <Button
              variant="secondary"
              size="md"
              icon={<RefreshIcon />}
              loading={state === 'loading'}
              onClick={() => void loadTrending()}
            >
              {t('home:refresh')}
            </Button>
          </div>

          {response ? (
            <div className={styles.metaRow}>
              {meta.map((item) => (
                <span key={item.label} className={styles.metaItem}>
                  <span className={styles.metaLabel}>{item.label}</span>
                  <span className={styles.metaValue}>{item.value}</span>
                </span>
              ))}
              <Pill tone={aiTone} dot>
                {aiStatusText}
              </Pill>
            </div>
          ) : null}
        </header>

        {response?.stale ? (
          <div className={styles.notice} role="status">
            <AlertIcon size={16} />
            <span>{t('home:staleNotice')}</span>
          </div>
        ) : null}

        {response?.aiStatus === 'failed' && response.aiError ? (
          <div className={styles.notice} role="status">
            <InfoIcon size={16} />
            <span>{t('home:aiFailed', { error: response.aiError })}</span>
          </div>
        ) : null}

        {openError ? (
          <div className={styles.notice} role="alert">
            <AlertIcon size={16} />
            <span>{t('home:openFailedWithError', { error: openError })}</span>
          </div>
        ) : null}

        <main className={styles.list} aria-label={t('home:listAria')}>
          {state === 'loading' ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className={styles.skeleton} aria-hidden="true" />
            ))
          ) : state === 'error' ? (
            <div className={styles.empty} role="alert">
              <p className={styles.emptyTitle}>{t('home:loadFailed')}</p>
              <p className={styles.emptyDesc}>{error ?? t('home:loadFailedFallback')}</p>
              <Button variant="primary" size="md" icon={<RefreshIcon />} onClick={() => void loadTrending()}>
                {t('home:retry')}
              </Button>
            </div>
          ) : !response || response.repos.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>{t('home:emptyTitle')}</p>
              <p className={styles.emptyDesc}>{t('home:emptyDesc')}</p>
            </div>
          ) : (
            response.repos.map((repo) => (
              <GithubRepoCard
                key={repo.fullName}
                repo={repo}
                language={language}
                onOpen={handleOpen}
              />
            ))
          )}
        </main>
      </div>
    </div>
  );
}

export default Home;
