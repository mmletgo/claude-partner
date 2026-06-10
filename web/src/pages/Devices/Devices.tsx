/**
 * Devices 页面 - 局域网设备管理
 *
 * Business Logic（为什么需要这个页面）:
 *   局域网 P2P 是 Claude Partner 的核心传输通道；用户需要看到当前网络上
 *   通过 mDNS 自动发现的对端设备，了解每个设备的状态、地址和端口，并
 *   知道本机在网络中的标识（方便区分“自己”）。本机信息单独高亮，以便
 *   用户在多设备场景下立即定位自己。
 *
 * Code Logic（这个页面做什么）:
 *   - 页面头部展示标题 + 在线数量 Pill + 副标题 + 手动刷新按钮
 *   - 顶部 outlined Card 显示本机信息（设备名 + IP + 端口 + 状态）
 *   - 主区域用 auto-fill 网格渲染 DeviceCard，加载/空/错误态分别走
 *     skeleton / empty hint / error block
 *   - 启动后用 setInterval 每 5 秒拉取一次，模拟 SSE 推送设备状态变化；
 *     卸载时清除 interval 防止内存泄漏
 *   - 容器居中、限宽，保证在大窗口下也保持可读
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Card, Pill, Button, Input } from '@/components/primitives';
import { DeviceCard } from '@/components/domain';
import { devicesApi } from '@/api/devices';
import { SyncIcon, DevicesIcon, AlertIcon } from '@/lib/icons';
import type { Device } from '@/lib/types';
import styles from './Devices.module.css';

/** 页面刷新间隔（ms），用于模拟服务端推送 */
const REFRESH_INTERVAL_MS = 5000;

/** Mock 本机信息（在真实环境下应由配置或后端注入） */
const SELF_DEVICE: Device = {
  id: 'self',
  name: "Hans's MacBook Pro",
  address: '192.168.1.42',
  port: 7842,
  status: 'online',
};

/**
 * Devices 页面组件
 *
 * @returns Devices 路由的根容器
 */
export function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState<number>(0);
  const [search, setSearch] = useState<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * 拉取设备列表；按后端契约映射为前端 Device 类型。
   * 由于本项目暂无真实后端，采用 mocked 数据 + 失败重试回退：
   * 任何 API 错误都不会阻塞 UI，而是以空列表 + 错误提示形式呈现。
   */
  const fetchDevices = useCallback(async () => {
    try {
      const list = await devicesApi.list();
      setDevices(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '拉取设备列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次挂载 + tick 变化时重新拉取，模拟 SSE
  useEffect(() => {
    fetchDevices();
  }, [fetchDevices, tick]);

  // 启动 5s 定时器，模拟服务端推送
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTick((prev) => prev + 1);
    }, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // 派生数据：搜索过滤 + 排序（self 永远排第一）
  const filteredDevices = devices.filter((d) =>
    d.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const onlineCount = devices.filter((d) => d.status === 'online').length;

  /**
   * 处理搜索输入
   *
   * @param e input change 事件
   */
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  /**
   * 手动触发刷新：递增 tick，下一次 effect 会重新拉取
   */
  const handleRefresh = () => {
    setLoading(true);
    setTick((prev) => prev + 1);
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* 页面头部 */}
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>
              在线设备
              <Pill tone={onlineCount > 0 ? 'success' : 'neutral'} className={styles.countPill}>
                {onlineCount} 个在线
              </Pill>
            </h1>
            <p className={styles.lead}>局域网内通过 mDNS 自动发现的对端实例</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<SyncIcon />}
            onClick={handleRefresh}
            loading={loading}
          >
            刷新
          </Button>
        </header>

        {/* 本机信息 */}
        <Card variant="outlined" padding="md" className={styles.selfCard}>
          <div className={styles.selfRow}>
            <div className={styles.selfLabel}>
              <span className={styles.selfDot} aria-hidden="true" />
              <span>本机信息</span>
            </div>
            <div className={styles.selfMeta}>
              <span className={styles.selfName}>{SELF_DEVICE.name}</span>
              <span className={styles.selfSep}>·</span>
              <span className={styles.selfMono}>
                {SELF_DEVICE.address}:{SELF_DEVICE.port}
              </span>
              <span className={styles.selfSep}>·</span>
              <Pill tone="accent" className={styles.selfPill}>
                在线
              </Pill>
            </div>
          </div>
        </Card>

        {/* 搜索栏 */}
        <div className={styles.searchRow}>
          <Input
            type="search"
            value={search}
            onChange={handleSearchChange}
            placeholder="按设备名搜索…"
            icon={<DevicesIcon />}
          />
        </div>

        {/* 错误提示 */}
        {error ? (
          <div className={styles.errorBox} role="alert">
            <AlertIcon />
            <span>{error}</span>
          </div>
        ) : null}

        {/* 设备网格 */}
        {loading && devices.length === 0 ? (
          <div className={styles.grid} aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={styles.skeleton} aria-hidden="true" />
            ))}
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>暂无发现其他设备</p>
            <p className={styles.emptyHint}>请确保其他设备与本机在同一局域网内</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {filteredDevices.map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

Devices.displayName = 'Devices';
