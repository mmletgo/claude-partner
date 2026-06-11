/**
 * Home 首页
 *
 * Business Logic（为什么需要这个页面）:
 *   用户打开应用第一眼看到的"门面"页——汇总核心操作的入口（新建 Prompt / 发送文件 / 发现设备），
 *   并以"最近的 Prompts"列表让用户延续上次工作。Home 自身不维护数据状态，全部通过
 *   promptsApi / devicesApi 拉取，避免与 Prompts/Devices 页发生数据同步冲突。
 *
 * Code Logic（这个页面做什么）:
 *   - Hero 区域展示 eyebrow + 主标题 + lede + 一行 meta（时间/设备/局域网状态）
 *   - 三张快捷操作卡片：链接到 /prompts、/transfer、/devices
 *   - "最近的 Prompts" 区域：调用 promptsApi.list() 拉取最新 5 条并用 PromptCard 渲染
 *     loading / empty / error 三种状态各自有专属空态
 *   - 设备数用 devicesApi.list() 异步拉取，仅用于"发现设备"卡片的副标题
 *   - 本机设备名用 configApi.get() 拉取，用于 meta 行显示
 *   - 所有可见文案经 i18n（home ns）；局域网在线数为英文复数，调用
 *     t('home:devicesOnline', { count }) 自动按语言选择单复数 key
 *   - 所有 hooks 放在任何 early return 之前（符合 React rules of hooks + 父项目 hook 顺序约定）
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Pill } from '@/components/primitives';
import { PromptCard } from '@/components/domain';
import {
  PlusIcon,
  TransferIcon,
  DevicesIcon,
  ArrowRightIcon,
} from '@/lib/icons';
import { promptsApi } from '@/api/prompts';
import { devicesApi } from '@/api/devices';
import { configApi } from '@/api/config';
import type { Prompt, Device } from '@/lib/types';
import styles from './Home.module.css';

/** Home 页面拉取状态：loading（首屏骨架）/ ready（已拿到数据） / error（接口失败） */
type LoadState = 'loading' | 'ready' | 'error';

/** 元信息行：当前时间（秒级更新），局域网在线设备数 */
interface MetaState {
  time: string;
  onlineCount: number;
}

const DEFAULT_META: MetaState = {
  time: '--:--',
  onlineCount: 0,
};

/**
 * 把 Date 对象格式化为 "HH:mm"
 */
function formatClock(d: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Home 页面根组件
 *
 * @returns 在 AppShell main 区域中渲染的内容
 */
export function Home() {
  const { t } = useTranslation(['home']);
  const [now, setNow] = useState<Date>(() => new Date());
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [promptState, setPromptState] = useState<LoadState>('loading');
  const [promptError, setPromptError] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [deviceName, setDeviceName] = useState<string>('');

  // 时钟每秒更新一次；卸载时清理 timer
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  // 进入页面拉取最新 5 条 Prompt
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await promptsApi.list();
        if (cancelled) return;
        // 按 updatedAt 倒序，取前 5 条
        const sorted = [...data].sort((a, b) => {
          const ta = new Date(a.updatedAt).getTime();
          const tb = new Date(b.updatedAt).getTime();
          return tb - ta;
        });
        setPrompts(sorted.slice(0, 5));
        setPromptState('ready');
      } catch (err) {
        if (cancelled) return;
        setPromptState('error');
        setPromptError(err instanceof Error ? err.message : t('home:unknownError'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  // 设备数：用于"发现设备"卡片副标题
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list: Device[] = await devicesApi.list();
        if (cancelled) return;
        const online = list.filter((d) => d.status === 'online').length;
        setOnlineCount(online);
      } catch {
        // 设备列表失败不影响主流程，保持 0
        if (!cancelled) setOnlineCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 本机设备名：从 AppConfig 获取，用于 meta 行显示
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await configApi.get();
        if (!cancelled) setDeviceName(config.deviceName);
      } catch {
        // 配置获取失败不影响主流程，metaValue 回退占位
        if (!cancelled) setDeviceName('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 派生元信息
  const meta: MetaState = {
    ...DEFAULT_META,
    time: formatClock(now),
    onlineCount,
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* ── Hero ── */}
        <section className={styles.hero}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            {t('home:eyebrow')}
          </div>
          <h1 className={styles.title}>{t('home:title')}</h1>
          <p className={styles.lede}>{t('home:lede')}</p>
          <div className={styles.metaRow}>
            <span className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('home:now')}</span>
              <span className={styles.metaValue}>{meta.time}</span>
            </span>
            <span className={styles.metaDivider} aria-hidden="true" />
            <span className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('home:local')}</span>
              <span className={styles.metaValue}>{deviceName || t('home:localValue')}</span>
            </span>
            <span className={styles.metaDivider} aria-hidden="true" />
            <span className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('home:lan')}</span>
              <Pill tone={meta.onlineCount > 0 ? 'success' : 'neutral'}>
                {meta.onlineCount > 0
                  ? t('home:devicesOnline', { count: meta.onlineCount })
                  : t('home:disconnected')}
              </Pill>
            </span>
          </div>
        </section>

        {/* ── Quick Actions ── */}
        <section className={styles.quickActions} aria-label={t('home:quickActionsAria')}>
          <Link to="/prompts" className={styles.qaLink}>
            <Card variant="elevated" className={styles.qaCard}>
              <Card.Body padding="md" className={styles.qaBody}>
                <div className={styles.qaIcon} aria-hidden="true">
                  <PlusIcon />
                </div>
                <h3 className={styles.qaTitle}>{t('home:newPrompt')}</h3>
                <p className={styles.qaDesc}>{t('home:newPromptDesc')}</p>
              </Card.Body>
            </Card>
          </Link>

          <Link to="/transfer" className={styles.qaLink}>
            <Card variant="elevated" className={styles.qaCard}>
              <Card.Body padding="md" className={styles.qaBody}>
                <div className={styles.qaIcon} aria-hidden="true">
                  <TransferIcon />
                </div>
                <h3 className={styles.qaTitle}>{t('home:sendFile')}</h3>
                <p className={styles.qaDesc}>{t('home:sendFileDesc')}</p>
              </Card.Body>
            </Card>
          </Link>

          <Link to="/devices" className={styles.qaLink}>
            <Card variant="elevated" className={styles.qaCard}>
              <Card.Body padding="md" className={styles.qaBody}>
                <div className={styles.qaIcon} aria-hidden="true">
                  <DevicesIcon />
                </div>
                <h3 className={styles.qaTitle}>{t('home:discoverDevices')}</h3>
                <p className={styles.qaDesc}>
                  {onlineCount > 0
                    ? t('home:discoverDevicesOnline', { count: onlineCount })
                    : t('home:discoverDevicesEmpty')}
                </p>
              </Card.Body>
            </Card>
          </Link>
        </section>

        {/* ── 最近的 Prompts ── */}
        <section className={styles.recent} aria-label={t('home:recentAria')}>
          <header className={styles.recentHead}>
            <h2 className={styles.recentTitle}>{t('home:recentPrompts')}</h2>
            <Link to="/prompts" className={styles.viewAll}>
              {t('home:viewAll')}
              <ArrowRightIcon size={14} />
            </Link>
          </header>

          <div className={styles.list}>
            {promptState === 'loading' ? (
              <>
                <div className={styles.skeleton} />
                <div className={styles.skeleton} />
                <div className={styles.skeleton} />
              </>
            ) : promptState === 'error' ? (
              <div className={styles.empty} role="alert">
                <p className={styles.emptyTitle}>{t('home:loadFailed')}</p>
                <p className={styles.emptyDesc}>
                  {promptError ?? t('home:loadFailedFallback')}
                </p>
              </div>
            ) : prompts.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>{t('home:emptyPrompt')}</p>
                <p className={styles.emptyDesc}>{t('home:emptyPromptDesc')}</p>
                <Link to="/prompts" className={styles.emptyCta}>
                  {t('home:goPromptLibrary')}
                  <ArrowRightIcon size={14} />
                </Link>
              </div>
            ) : (
              prompts.map((p) => <PromptCard key={p.id} prompt={p} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default Home;
