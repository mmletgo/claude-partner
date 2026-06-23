/**
 * GithubRepoCard 业务组件
 *
 * Business Logic（为什么需要这个组件）:
 *   首页需要把 GitHub 周热门项目展示为可快速扫描的卡片，用户能看到项目热度、语言、
 *   原始简介和当前界面语言对应的 Claude 解说，并可跳转到 GitHub 查看详情。
 *
 * Code Logic（这个组件做什么）:
 *   接收单个 GithubTrendingRepo 与当前语言，选择中/英文 explanation；
 *   复用 Card、Pill、Button 组合排名、仓库名、指标和打开按钮。
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Pill } from '@/components/primitives';
import { ExternalLinkIcon, ForkIcon, StarIcon } from '@/lib/icons';
import type { AppLanguage } from '@/i18n';
import type { GithubTrendingRepo } from '@/lib/types';
import styles from './GithubRepoCard.module.css';

export interface GithubRepoCardProps {
  repo: GithubTrendingRepo;
  language: AppLanguage;
  onOpen: (url: string) => void;
}

/**
 * 格式化大数字，保持卡片指标短而易读。
 *
 * @param value 原始数字
 * @param language 当前界面语言
 * @returns 本地化 compact number
 */
function formatCompactNumber(value: number, language: AppLanguage): string {
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * 渲染 GitHub Trending 仓库卡片。
 *
 * @param props 仓库数据、当前语言与打开回调
 * @returns GitHub 仓库卡片
 */
export function GithubRepoCard(props: GithubRepoCardProps) {
  const { repo, language, onOpen } = props;
  const { t } = useTranslation(['home']);

  const explanation = useMemo(() => {
    const selected = language === 'zh' ? repo.explanationZh : repo.explanationEn;
    return selected?.trim() || t('home:repoCard.noExplanation');
  }, [language, repo.explanationEn, repo.explanationZh, t]);

  return (
    <Card variant="elevated" padding="none" className={styles.card}>
      <Card.Body padding="lg" className={styles.body}>
        <div className={styles.rank} aria-label={t('home:repoCard.rank', { rank: repo.rank })}>
          #{repo.rank}
        </div>

        <div className={styles.content}>
          <div className={styles.head}>
            <div className={styles.titleBlock}>
              <p className={styles.owner}>{repo.owner}</p>
              <h2 className={styles.name}>{repo.name}</h2>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<ExternalLinkIcon />}
              onClick={() => onOpen(repo.url)}
            >
              {t('home:repoCard.open')}
            </Button>
          </div>

          <p className={styles.description}>
            {repo.description || t('home:repoCard.noDescription')}
          </p>
          <p className={styles.explanation}>{explanation}</p>

          <div className={styles.meta}>
            {repo.language ? (
              <Pill tone="accent" dot>
                {repo.language}
              </Pill>
            ) : null}
            <span className={styles.metric}>
              <StarIcon size={14} />
              {formatCompactNumber(repo.stars, language)}
            </span>
            <span className={styles.metric}>
              <ForkIcon size={14} />
              {formatCompactNumber(repo.forks, language)}
            </span>
            <span className={styles.metricStrong}>
              <StarIcon size={14} />
              {t('home:repoCard.starsThisWeek', {
                count: formatCompactNumber(repo.starsThisWeek, language),
              })}
            </span>
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}

GithubRepoCard.displayName = 'GithubRepoCard';
