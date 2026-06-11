/**
 * 通用工具函数
 */
import i18n, { type AppLanguage } from '../i18n';

/**
 * formatBytes
 *
 * Business Logic（为什么需要这个函数）:
 *   文件传输、磁盘占用等场景需要把字节数展示成"1.5 MB"这类可读大小,
 *   方便用户直观理解数据量级。
 *
 * Code Logic（这个函数做什么）:
 *   按 1024 进制换算字节,依次匹配 KB/MB/GB/TB 单位并保留指定小数位;
 *   非有限数或负数返回 '0 B',小于 1024 直接显示字节。
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

/**
 * formatSpeed
 *
 * Business Logic（为什么需要这个函数）:
 *   文件传输过程中需要展示实时传输速率,让用户感知当前速度。
 *
 * Code Logic（这个函数做什么）:
 *   复用 formatBytes 把每秒字节数格式化为带单位的字符串,再拼接 '/s' 后缀。
 */
export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

/**
 * formatRelativeTime
 *
 * Business Logic（为什么需要这个函数）:
 *   设备"最后活跃"、Prompt 创建时间等场景需要把时间戳展示为"3 分钟前"这类
 *   相对时间;且要随当前界面语言在中英文间切换。
 *
 * Code Logic（这个函数做什么）:
 *   用 Intl.RelativeTimeFormat 按当前语言(numeric:'auto')生成相对时间;
 *   超过 7 天则回退到 toLocaleDateString。lang 缺省取 i18n.language。
 */
export function formatRelativeTime(
  iso: string,
  lang: AppLanguage = i18n.language === 'zh' ? 'zh' : 'en'
): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const locale = lang === 'zh' ? 'zh-CN' : 'en-US';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const sec = Math.round(diffMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return rtf.format(-sec, 'second');
  if (min < 60) return rtf.format(-min, 'minute');
  if (hr < 24) return rtf.format(-hr, 'hour');
  if (day < 7) return rtf.format(-day, 'day');
  return date.toLocaleDateString(locale);
}

/**
 * debounce
 *
 * Business Logic（为什么需要这个函数）:
 *   搜索框输入、窗口 resize 等高频触发的事件需要在用户停顿后再执行回调,
 *   避免每次按键都触发昂贵的逻辑。
 *
 * Code Logic（这个函数做什么）:
 *   包装目标函数,用 setTimeout 延迟执行;在计时结束前再次调用则清掉旧计时
 *   并重新计时,从而只在最后一次调用后静默 ms 毫秒才真正触发。
 */
export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
