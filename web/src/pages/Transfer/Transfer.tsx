/**
 * Transfer 页面 - 局域网文件传输
 *
 * Business Logic（为什么需要这个页面）:
 *   cc-partner 的核心场景之一是把文件快速在多台设备之间搬运。
 *   用户需要在一个屏幕里同时看到：选哪台目标设备、当前正在传什么、历史完成情况。
 *   该页面是 File Transfer 路由（/transfer）下的主视图，让用户通过
 *   选择器 + 拖拽完成一次发送，并通过自动刷新的任务列表监控进展。
 *
 * Code Logic（这个页面做什么）:
 *   - 顶部 page header：标题 + 副标题，描述当前页面的能力
 *   - 发送区：设备下拉（来自 devicesApi.list）+ 文件选择按钮 + 拖拽 dropzone
 *   - 任务列表：调用 transferApi.list() 拉取，3 秒 setInterval 刷新
 *   - API 失败 / 返回空时展示空状态和错误提示（含重试按钮）
 *   - 状态计数 Pill（活跃/已完成/失败）实时反映任务分布
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Pill } from '@/components/primitives';
import { TransferItem } from '@/components/domain';
import { devicesApi } from '@/api/devices';
import { transferApi } from '@/api/transfer';
import type { Device, TransferTask } from '@/lib/types';
import { SendIcon, UploadIcon } from '@/lib/icons';
import styles from './Transfer.module.css';

// 3 秒轮询间隔，平衡实时性与后端压力
const REFRESH_INTERVAL_MS = 3000;

type LoadState = 'loading' | 'success' | 'error';

/**
 * Transfer 页面主组件
 */
export function Transfer() {
  const { t } = useTranslation(['transfer', 'common']);

  // ── 设备列表（目标设备下拉数据源） ──
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [devicesState, setDevicesState] = useState<LoadState>('loading');
  const [devicesError, setDevicesError] = useState<string | null>(null);

  // ── 任务列表 ──
  const [tasks, setTasks] = useState<TransferTask[]>([]);
  const [tasksState, setTasksState] = useState<LoadState>('loading');
  const [tasksError, setTasksError] = useState<string | null>(null);

  // ── 文件选择 / 拖拽 ──
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * 拉取设备列表；API 失败或返回空时设为空数组并提示错误
   */
  const loadDevices = useCallback(async () => {
    try {
      const data = await devicesApi.list();
      setDevices(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length > 0) {
        setSelectedDeviceId((prev) => prev || data[0]!.id);
      }
      setDevicesState('success');
      setDevicesError(null);
    } catch (err) {
      setDevices([]);
      setDevicesState('error');
      setDevicesError(t('transfer:deviceLoadFailed', { error: err instanceof Error ? err.message : String(err) }));
    }
  }, [t]);

  /**
   * 拉取传输任务列表；API 失败或返回空时设为空数组并提示错误
   */
  const loadTasks = useCallback(async () => {
    try {
      const data = await transferApi.list();
      setTasks(Array.isArray(data) ? data : []);
      setTasksState('success');
      setTasksError(null);
    } catch (err) {
      setTasks([]);
      setTasksState('error');
      setTasksError(t('transfer:taskLoadFailed', { error: err instanceof Error ? err.message : String(err) }));
    }
  }, [t]);

  // 首次挂载拉取设备
  /* eslint-disable react-hooks/set-state-in-effect -- 合法 fetch-in-effect，setState 在 await 后异步执行 */
  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 首次挂载拉取任务，并设置 3 秒轮询
  /* eslint-disable react-hooks/set-state-in-effect -- 合法 fetch-in-effect，setState 在 await 后异步执行 */
  useEffect(() => {
    void loadTasks();
    const timer = window.setInterval(() => {
      void loadTasks();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadTasks]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    // 此处仅在控制台提示，待后端接口完成后接入
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
        <h1 className={styles.title}>{t('transfer:title')}</h1>
        <p className={styles.lead}>{t('transfer:lead')}</p>
      </header>

      {/* 发送区 */}
      <Card variant="elevated" className={styles.sendCard}>
        <div className={styles.sendTop}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('transfer:fieldLabel')}</span>
            <div className={styles.selectWrap}>
              <select
                className={styles.select}
                value={selectedDeviceId}
                onChange={handleDeviceChange}
                aria-label={t('transfer:selectDevice')}
                disabled={devicesState === 'loading'}
              >
                {devicesState === 'loading' ? (
                  <option value="">{t('transfer:loading')}</option>
                ) : devices.length === 0 ? (
                  <option value="">{t('transfer:noDevices')}</option>
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
              {pickedFileName
                ? t('transfer:sendFile', { file: pickedFileName })
                : t('transfer:pickFile')}
            </Button>
            <Button variant="secondary" size="md" onClick={handlePickClick}>
              {t('transfer:browse')}
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
          aria-label={t('transfer:dropAria')}
        >
          <span className={styles.dropIcon} aria-hidden="true">
            <UploadIcon size={20} />
          </span>
          <p className={styles.dropTitle}>
            {pickedFileName
              ? t('transfer:dropTitlePicked', { file: pickedFileName })
              : t('transfer:dropTitleEmpty')}
          </p>
          <p className={styles.dropHint}>{t('transfer:chunkHint')}</p>
        </div>

        {devicesState === 'error' ? (
          <p className={styles.notice} role="status">
            {devicesError}{' '}
            <Button variant="secondary" size="sm" onClick={() => void loadDevices()}>
              {t('common:action.retry')}
            </Button>
          </p>
        ) : null}
      </Card>

      {/* 任务列表 */}
      <section className={styles.tasksSection}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>
            {t('transfer:tasksTitle')}{' '}
            <span className={styles.sectionCount}>({tasks.length})</span>
          </h2>
          <div className={styles.statusPills}>
            <Pill tone="accent" dot>
              {t('transfer:active', { n: statusCounts.active })}
            </Pill>
            <Pill tone="success">
              {t('transfer:completed', { n: statusCounts.completed })}
            </Pill>
            <Pill tone="danger">{t('transfer:failed', { n: statusCounts.failed })}</Pill>
          </div>
        </div>

        {tasksState === 'loading' && tasks.length === 0 ? (
          <TaskListSkeleton />
        ) : tasks.length === 0 ? (
          <div className={styles.empty}>
            <p>{t('transfer:empty')}</p>
            <p className={styles.emptyHint}>{t('transfer:emptyHint')}</p>
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
            {tasksError}{' '}
            <Button variant="secondary" size="sm" onClick={() => void loadTasks()}>
              {t('common:action.retry')}
            </Button>
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
  const { t } = useTranslation(['transfer']);
  return (
    <ul className={styles.taskList} aria-busy="true" aria-label={t('transfer:skeletonAria')}>
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
