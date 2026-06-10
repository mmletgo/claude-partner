/**
 * Transfer 页面 - 局域网文件传输
 *
 * Business Logic（为什么需要这个页面）:
 *   Claude Partner 的核心场景之一是把文件快速在多台设备之间搬运。
 *   用户需要在一个屏幕里同时看到：选哪台目标设备、当前正在传什么、历史完成情况。
 *   该页面是 File Transfer 路由（/transfer）下的主视图，让用户通过
 *   选择器 + 拖拽完成一次发送，并通过自动刷新的任务列表监控进展。
 *
 * Code Logic（这个页面做什么）:
 *   - 顶部 page header：标题 + 副标题，描述当前页面的能力
 *   - 发送区：设备下拉（来自 devicesApi.list）+ 文件选择按钮 + 拖拽 dropzone
 *   - 任务列表：调用 transferApi.list() 拉取，3 秒 setInterval 刷新
 *   - API 失败 / 返回空时使用 mock 任务展示，保留 transferring/completed/failed 三种状态
 *   - 状态计数 Pill（活跃/已完成/失败）实时反映任务分布
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { Button, Card, Pill } from '@/components/primitives';
import { TransferItem } from '@/components/domain';
import { devicesApi } from '@/api/devices';
import { transferApi } from '@/api/transfer';
import type { Device, TransferTask } from '@/lib/types';
import { SendIcon, UploadIcon } from '@/lib/icons';
import styles from './Transfer.module.css';

// ────────────────────────────────────────────────────────────────
// Mock 数据：当后端未连接或返回空数组时使用，保证页面有内容展示
// ────────────────────────────────────────────────────────────────

const MOCK_DEVICES: Device[] = [
  { id: 'dev-imac', name: "Hans's iMac Studio", address: '192.168.1.45', port: 7891, status: 'online', lastSeen: new Date().toISOString() },
  { id: 'dev-ubuntu', name: "Hans's Ubuntu Workstation", address: '192.168.1.51', port: 7892, status: 'online', lastSeen: new Date().toISOString() },
  { id: 'dev-macmini', name: 'Living Room Mac mini', address: '192.168.1.30', port: 7893, status: 'offline', lastSeen: new Date(Date.now() - 2 * 3600_000).toISOString() },
];

const MOCK_TASKS: TransferTask[] = [
  {
    id: 't-001',
    fileName: 'claude-partner-v0.4.2.zip',
    filePath: '/Users/hans/Downloads/claude-partner-v0.4.2.zip',
    fileSize: 245 * 1024 * 1024,
    direction: 'send',
    status: 'transferring',
    progress: 0.78,
    peerDeviceId: 'dev-ubuntu',
    peerDeviceName: "Hans's Ubuntu Workstation",
    speed: 12.4 * 1024 * 1024,
    startedAt: new Date(Date.now() - 30_000).toISOString(),
  },
  {
    id: 't-002',
    fileName: 'presentation-deck.key',
    filePath: '/Users/hans/Documents/presentation-deck.key',
    fileSize: 38 * 1024 * 1024,
    direction: 'send',
    status: 'pending',
    progress: 0,
    peerDeviceId: 'dev-imac',
    peerDeviceName: "Hans's iMac Studio",
    startedAt: new Date().toISOString(),
  },
  {
    id: 't-003',
    fileName: 'screenshot-2026-06-10.png',
    filePath: '/Users/hans/Desktop/screenshot-2026-06-10.png',
    fileSize: 1.2 * 1024 * 1024,
    direction: 'send',
    status: 'completed',
    progress: 1,
    peerDeviceId: 'dev-imac',
    peerDeviceName: "Hans's iMac Studio",
    startedAt: new Date(Date.now() - 600_000).toISOString(),
    completedAt: new Date(Date.now() - 540_000).toISOString(),
  },
  {
    id: 't-004',
    fileName: 'huge-dataset.csv',
    filePath: '/Users/hans/Data/huge-dataset.csv',
    fileSize: 1.8 * 1024 * 1024 * 1024,
    direction: 'send',
    status: 'failed',
    progress: 0.34,
    peerDeviceId: 'dev-imac',
    peerDeviceName: "Hans's iMac Studio",
    errorMessage: '设备离线',
    startedAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
  {
    id: 't-005',
    fileName: 'project-handoff.pdf',
    filePath: '/Users/hans/Work/project-handoff.pdf',
    fileSize: 4.5 * 1024 * 1024,
    direction: 'receive',
    status: 'completed',
    progress: 1,
    peerDeviceId: 'dev-imac',
    peerDeviceName: "Hans's iMac Studio",
    startedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    completedAt: new Date(Date.now() - 2 * 3600_000 + 12_000).toISOString(),
  },
];

// 3 秒轮询间隔，平衡实时性与后端压力
const REFRESH_INTERVAL_MS = 3000;

type LoadState = 'loading' | 'success' | 'error';

/**
 * Transfer 页面主组件
 */
export function Transfer() {
  // ── 设备列表（目标设备下拉数据源） ──
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [devicesState, setDevicesState] = useState<LoadState>('loading');
  const [devicesError, setDevicesError] = useState<string | null>(null);

  // ── 任务列表 ──
  const [tasks, setTasks] = useState<TransferTask[]>([]);
  const [tasksState, setTasksState] = useState<LoadState>('loading');
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [usedMockTasks, setUsedMockTasks] = useState(false);

  // ── 文件选择 / 拖拽 ──
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * 拉取设备列表；失败或空时回退到 mock
   */
  const loadDevices = useCallback(async () => {
    try {
      const data = await devicesApi.list();
      if (Array.isArray(data) && data.length > 0) {
        setDevices(data);
        setSelectedDeviceId((prev) => prev || data[0]!.id);
      } else {
        setDevices(MOCK_DEVICES);
        setSelectedDeviceId((prev) => prev || MOCK_DEVICES[0]!.id);
      }
      setDevicesState('success');
      setDevicesError(null);
    } catch (err) {
      setDevices(MOCK_DEVICES);
      setSelectedDeviceId((prev) => prev || MOCK_DEVICES[0]!.id);
      setDevicesState('error');
      setDevicesError(err instanceof Error ? err.message : '设备列表加载失败');
    }
  }, []);

  /**
   * 拉取传输任务列表；失败或空时回退到 mock
   */
  const loadTasks = useCallback(async () => {
    try {
      const data = await transferApi.list();
      if (Array.isArray(data) && data.length > 0) {
        setTasks(data);
        setUsedMockTasks(false);
      } else {
        setTasks(MOCK_TASKS);
        setUsedMockTasks(true);
      }
      setTasksState('success');
      setTasksError(null);
    } catch (err) {
      setTasks(MOCK_TASKS);
      setUsedMockTasks(true);
      setTasksState('error');
      setTasksError(err instanceof Error ? err.message : '任务列表加载失败');
    }
  }, []);

  // 首次挂载拉取设备
  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  // 首次挂载拉取任务，并设置 3 秒轮询
  useEffect(() => {
    void loadTasks();
    const timer = window.setInterval(() => {
      void loadTasks();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadTasks]);

  // ── 状态计数（按 status 分组） ──
  const statusCounts = useMemo(() => {
    return tasks.reduce(
      (acc, t) => {
        if (t.status === 'transferring' || t.status === 'pending') acc.active += 1;
        else if (t.status === 'completed') acc.completed += 1;
        else if (t.status === 'failed' || t.status === 'cancelled') acc.failed += 1;
        return acc;
      },
      { active: 0, completed: 0, failed: 0 },
    );
  }, [tasks]);

  // ── 文件选择处理 ──
  const handleFilePick = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPickedFileName(file.name);
  }, []);

  const handlePickClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ── 拖拽支持 ──
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setPickedFileName(file.name);
  }, []);

  // ── 设备下拉变更 ──
  const handleDeviceChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    setSelectedDeviceId(e.target.value);
  }, []);

  // ── 发送按钮（当前仅记录所选文件，预留接入 transferApi.send） ──
  const handleSendClick = useCallback(() => {
    if (!pickedFileName || !selectedDeviceId) return;
    // 真实实现应调用 transferApi.send(selectedDeviceId, filePath)
    // 此处仅在控制台提示，避免 mock 数据下产生误操作
    // eslint-disable-next-line no-console
    console.info('[Transfer] would send', pickedFileName, 'to', selectedDeviceId);
  }, [pickedFileName, selectedDeviceId]);

  const dropzoneClasses = [styles.dropzone, isDragOver ? styles.dropzoneOver : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.page}>
      {/* 页面头部 */}
      <header className={styles.pageHeader}>
        <span className={styles.eyebrow}>Transfer</span>
        <h1 className={styles.title}>文件传输</h1>
        <p className={styles.lead}>
          选择目标设备，拖拽或点击发送文件。所有传输走局域网，支持断点续传与 SHA256 校验。
        </p>
      </header>

      {/* 发送区 */}
      <Card variant="elevated" className={styles.sendCard}>
        <div className={styles.sendTop}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>目标设备</span>
            <div className={styles.selectWrap}>
              <select
                className={styles.select}
                value={selectedDeviceId}
                onChange={handleDeviceChange}
                aria-label="选择目标设备"
                disabled={devicesState === 'loading'}
              >
                {devicesState === 'loading' ? (
                  <option value="">加载中…</option>
                ) : devices.length === 0 ? (
                  <option value="">暂无可用设备</option>
                ) : (
                  devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.address}:{d.port}
                    </option>
                  ))
                )}
              </select>
              <span className={styles.selectArrow} aria-hidden="true">
                ▾
              </span>
            </div>
          </label>

          <div className={styles.pickerCol}>
            <input
              ref={fileInputRef}
              type="file"
              className={styles.hiddenInput}
              onChange={handleFilePick}
            />
            <Button
              variant="primary"
              size="md"
              icon={<SendIcon />}
              onClick={handleSendClick}
              disabled={!pickedFileName || !selectedDeviceId}
            >
              {pickedFileName ? `发送「${pickedFileName}」` : '选择文件'}
            </Button>
            <Button variant="secondary" size="md" onClick={handlePickClick}>
              浏览…
            </Button>
          </div>
        </div>

        <div
          className={dropzoneClasses}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handlePickClick}
          role="button"
          tabIndex={0}
          aria-label="拖拽文件到此处或点击选择"
        >
          <span className={styles.dropIcon} aria-hidden="true">
            <UploadIcon size={20} />
          </span>
          <p className={styles.dropTitle}>
            {pickedFileName ? `已选择：${pickedFileName}` : '拖拽文件到此处 或 点击选择'}
          </p>
          <p className={styles.dropHint}>
            支持任意大小 · 自动分块 1MB · 断点可续传 · SHA256 校验
          </p>
        </div>

        {devicesState === 'error' ? (
          <p className={styles.notice} role="status">
            设备列表加载失败：{devicesError}。已使用本地示例数据。
          </p>
        ) : null}
      </Card>

      {/* 任务列表 */}
      <section className={styles.tasksSection}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>
            传输任务 <span className={styles.sectionCount}>({tasks.length})</span>
          </h2>
          <div className={styles.statusPills}>
            <Pill tone="accent" dot>
              活跃 {statusCounts.active}
            </Pill>
            <Pill tone="success">已完成 {statusCounts.completed}</Pill>
            <Pill tone="danger">失败 {statusCounts.failed}</Pill>
          </div>
        </div>

        {tasksState === 'loading' && tasks.length === 0 ? (
          <TaskListSkeleton />
        ) : tasks.length === 0 ? (
          <div className={styles.empty}>
            <p>暂无传输任务</p>
            <p className={styles.emptyHint}>选择目标设备和文件后即可开始传输</p>
          </div>
        ) : (
          <ul className={styles.taskList}>
            {tasks.map((task) => (
              <li key={task.id}>
                <TransferItem
                  task={{
                    id: task.id,
                    fileName: task.fileName,
                    fileSize: task.fileSize,
                    direction: task.direction,
                    status: task.status,
                    progress: task.progress,
                    peerDevice: task.peerDeviceName,
                    speed: task.speed,
                    errorMessage: task.errorMessage,
                  }}
                  onPause={() => {
                    /* 预留：调用后端暂停接口 */
                  }}
                  onCancel={() => {
                    void transferApi.cancel(task.id).catch(() => undefined);
                  }}
                  onRetry={() => {
                    /* 预留：调用后端重试接口 */
                  }}
                  onOpen={() => {
                    /* 预留：调起系统文件管理器 */
                  }}
                />
              </li>
            ))}
          </ul>
        )}

        {tasksState === 'error' ? (
          <p className={styles.notice} role="status">
            任务列表加载失败：{tasksError}
            {usedMockTasks ? '。已显示本地示例数据。' : '。'}
          </p>
        ) : null}
      </section>
    </div>
  );
}

/**
 * 任务列表骨架屏（loading 态）
 */
function TaskListSkeleton() {
  return (
    <ul className={styles.taskList} aria-busy="true" aria-label="加载传输任务">
      {[0, 1, 2].map((i) => (
        <li key={i} className={styles.skeletonRow}>
          <span
            className={styles.skeletonBlock}
            style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)' }}
          />
          <span className={styles.skeletonLines}>
            <span className={styles.skeletonBlock} style={{ width: '40%', height: 12 }} />
            <span className={styles.skeletonBlock} style={{ width: '60%', height: 10 }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
