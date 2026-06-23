/**
 * StatsChart - 健康提醒活动统计图表
 *
 * Business Logic（为什么需要这个组件）:
 *   用户需要直观看到「今天在哪些 app 上花了最多时间」和「一天 24 小时活跃分布」，
 *   以了解自己的屏幕使用习惯。用 recharts 把后端 get_activity_detail 的数据可视化：
 *   左侧 app 使用时长排行 top8（横向柱状图，倒序最长的在最上），右侧 24 小时活跃
 *   分布（纵向柱状图）。无数据时显示占位文案。
 *
 * Code Logic（这个组件做什么）:
 *   纯展示组件，接收 ActivityDetail prop。appData 取 appUsage 前 8 项；
 *   hourData 把 24 元素数组映射成 {h: 小时字符串, mins} 供 XAxis dataKey="h"。
 *   用 ResponsiveContainer 自适应宽度；layout="vertical" 实现横向柱（XAxis number /
 *   YAxis category）。hooks 仅 useTranslation，无 early return 故无顺序约束。
 */
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { ActivityDetail } from '@/lib/types';
import styles from './StatsChart.module.css';

interface StatsChartProps {
  /** 活动明细（app 排行 + 24 小时分布），来自 get_activity_detail */
  detail: ActivityDetail;
}

interface ChartTooltipProps extends TooltipContentProps {
  /** tooltip 数值单位 */
  unit: string;
}

/**
 * 渲染健康统计图表 tooltip
 *
 * Business Logic（为什么需要这个函数）:
 *   默认 Recharts tooltip 视觉与项目设计系统不一致,且没有统一展示分钟单位。
 *
 * Code Logic（这个函数做什么）:
 *   接收 Recharts tooltip props,在 active 且有 payload 时渲染 token 化 tooltip;
 *   非激活状态返回 null。
 */
function ChartTooltip(props: ChartTooltipProps) {
  const { active, payload, label, unit } = props;

  if (!active || !payload?.length) return null;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>{label}</div>
      <div className={styles.tooltipRow}>
        <span>{payload[0]?.name}</span>
        <strong>{Number(payload[0]?.value ?? 0)} {unit}</strong>
      </div>
    </div>
  );
}

/**
 * StatsChart 组件：渲染 app 使用时长排行 + 24 小时活跃分布两个图表。
 */
export function StatsChart({ detail }: StatsChartProps) {
  const { t } = useTranslation(['health', 'common']);
  const appData = detail.appUsage.slice(0, 8).map((a) => ({ name: a.name, minutes: a.minutes }));
  const hourData = detail.hourly.map((mins, h) => ({ h: `${h}`, mins }));
  const minuteUnit = t('health:minutesUnit');

  return (
    <div className={styles.grid}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.title}>{t('health:appUsageTitle')}</h3>
          <p className={styles.caption}>{t('health:topAppsCaption')}</p>
        </div>
        {appData.length === 0 ? (
          <p className={styles.empty}>{t('health:noData')}</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={appData} layout="vertical" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <XAxis type="number" stroke="var(--meta)" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={112}
                stroke="var(--meta)"
                tick={{ fill: 'var(--muted)', fontSize: 12 }}
              />
              <Tooltip
                content={(props) => <ChartTooltip {...props} unit={minuteUnit} />}
                cursor={{ fill: 'var(--accent-soft)' }}
              />
              <Bar dataKey="minutes" name={t('health:activeToday')} fill="var(--success)" radius={[0, 6, 6, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.title}>{t('health:hourlyTitle')}</h3>
          <p className={styles.caption}>{t('health:hourlyCaption')}</p>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={hourData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <XAxis dataKey="h" stroke="var(--meta)" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
            <YAxis stroke="var(--meta)" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
            <Tooltip
              content={(props) => <ChartTooltip {...props} unit={minuteUnit} />}
              cursor={{ fill: 'var(--accent-soft)' }}
            />
            <Bar dataKey="mins" name={t('health:activeToday')} fill="var(--accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}

StatsChart.displayName = 'StatsChart';
