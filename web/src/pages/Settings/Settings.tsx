/**
 * Settings 页面 - 偏好设置中心
 *
 * Business Logic（为什么需要这个页面）:
 *   用户需要集中调整设备名、接收目录、快捷键、同步策略等运行时偏好，
 *   改变会通过表单即时反映在 UI 状态中；"保存"按钮在用户主动提交时
 *   把整张配置表序列化（mock）到本地存储，区分"未保存修改"和"已保存配置"。
 *
 * Code Logic（这个页面做什么）:
 *   - 顶部 4 个 Card 区块：基本设置 / 快捷键 / 同步与存储 / 关于
 *   - 单一 useState 对象管理所有字段（deviceName/receiveDir/shortcuts/toggles/theme），
 *     任意 onChange 触发整体 re-render，dirty 检测由浅比较 + ref 实现
 *   - Toggle 控件内联实现，避免引入额外 Switch 组件；状态切换走
 *     受控的 onClick + role="switch" + aria-checked
 *   - 底部按钮组：恢复默认走 ghost 风格重置状态、保存走 primary 风格
 *     触发 mock 持久化（console.log + localStorage）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Card, Button, Input, Pill } from '@/components/primitives';
import { CheckIcon, XIcon, DevicesIcon, FolderIcon, KeyboardIcon, SyncIcon, InfoIcon } from '@/lib/icons';
import styles from './Settings.module.css';

/** 应用版本号（与 src/claude_partner/__init__.py 保持一致） */
const APP_VERSION = '0.4.0';
/** 构建日期（mock 静态值，真实环境由 Vite 注入） */
const BUILD_DATE = '2026-06-10';

/** 单个快捷键字段定义 */
interface ShortcutField {
  id: string;
  label: string;
  helper: string;
  value: string;
}

/** 同步与存储开关定义 */
interface ToggleField {
  id: string;
  label: string;
  helper: string;
  enabled: boolean;
}

/** Settings 页面整体表单状态 */
interface SettingsState {
  deviceName: string;
  receiveDir: string;
  shortcuts: ShortcutField[];
  toggles: ToggleField[];
}

/** 初始状态工厂函数：用于"恢复默认"按钮重置 */
function createDefaultState(): SettingsState {
  return {
    deviceName: 'My MacBook',
    receiveDir: '/Users/hans/claude-partner-files',
    shortcuts: [
      { id: 'screenshot', label: '截图快捷键', helper: '框选区域并复制到剪贴板', value: 'Cmd+Shift+S' },
      { id: 'toggle-window', label: '切换窗口', helper: '显示/隐藏主窗口', value: 'Cmd+Shift+P' },
      { id: 'open-settings', label: '打开设置', helper: '直接定位到本面板', value: 'Cmd+,' },
      { id: 'quick-send', label: '快速发送', helper: '选择文件并发送到最近设备', value: 'Cmd+Shift+U' },
    ],
    toggles: [
      { id: 'auto-sync', label: '启用自动同步', helper: '联网后自动与其他设备同步 Prompt', enabled: true },
      { id: 'save-history', label: '保存传输历史', helper: '在本地数据库保留 30 天的传输记录', enabled: true },
      { id: 'encrypt-prompts', label: '加密敏感 Prompt', helper: '对包含密钥/令牌的 Prompt 启用额外加密', enabled: false },
    ],
  };
}

/**
 * Settings 页面组件
 *
 * @returns Settings 路由的根容器
 */
export function Settings() {
  const [state, setState] = useState<SettingsState>(createDefaultState);
  const initialStateRef = useRef<SettingsState>(state);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // 计算是否处于"未保存"状态
  const isDirty = useMemo(() => {
    return JSON.stringify(state) !== JSON.stringify(initialStateRef.current);
  }, [state]);

  /**
   * 通用字段更新：merge 浅层部分字段
   *
   * @param partial 待合并的字段
   */
  const patchState = useCallback((partial: Partial<SettingsState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  /**
   * 处理 deviceName 输入
   *
   * @param e change 事件
   */
  const handleDeviceNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    patchState({ deviceName: e.target.value });
  };

  /**
   * 处理 receiveDir 输入
   *
   * @param e change 事件
   */
  const handleReceiveDirChange = (e: ChangeEvent<HTMLInputElement>) => {
    patchState({ receiveDir: e.target.value });
  };

  /**
   * 处理快捷键输入
   *
   * @param id 快捷键 id
   * @param value 新的按键字符串
   */
  const handleShortcutChange = useCallback((id: string, value: string) => {
    setState((prev) => ({
      ...prev,
      shortcuts: prev.shortcuts.map((s) => (s.id === id ? { ...s, value } : s)),
    }));
  }, []);

  /**
   * 切换某项 toggle 的开关
   *
   * @param id toggle id
   */
  const handleToggleClick = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      toggles: prev.toggles.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)),
    }));
  }, []);

  /**
   * 恢复默认：重置 state 到默认值
   */
  const handleResetDefaults = () => {
    const next = createDefaultState();
    setState(next);
  };

  /**
   * 模拟"选择目录"按钮点击 - 真实环境会调用系统的 folder picker
   */
  const handleChooseDir = () => {
    // 真实环境：调起原生目录选择器。这里仅给用户一个轻量反馈。
    // eslint-disable-next-line no-console
    console.info('[Settings] 触发目录选择器（mock）');
  };

  /**
   * 保存按钮：把当前 state 持久化（mock）
   */
  const handleSave = () => {
    try {
      window.localStorage.setItem('cp-settings', JSON.stringify(state));
    } catch {
      // localStorage 可能不可用（隐私模式等），不影响 UI 流程
    }
    initialStateRef.current = state;
    setSavedAt(new Date());
  };

  // 进入页面时尝试从 localStorage 恢复（mock 持久化）
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('cp-settings');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SettingsState>;
      setState((prev) => {
        const next = { ...prev, ...parsed };
        initialStateRef.current = next;
        return next;
      });
    } catch {
      // 解析失败时保持默认状态
    }
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* 页面头部 */}
        <header className={styles.header}>
          <span className={styles.eyebrow}>PREFERENCES</span>
          <h1 className={styles.title}>设置</h1>
          <p className={styles.lead}>管理设备名、快捷键、同步策略与版本信息</p>
        </header>

        {/* Card 1: 基本设置 */}
        <Card variant="flat" padding="md">
          <Card.Header>
            <h2 className={styles.sectionTitle}>基本设置</h2>
          </Card.Header>
          <Card.Body padding="md">
            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-device-name">
                设备名称
              </label>
              <div className={styles.inputRow}>
                <Input
                  id="settings-device-name"
                  type="text"
                  value={state.deviceName}
                  onChange={handleDeviceNameChange}
                  icon={<DevicesIcon />}
                />
              </div>
              <p className={styles.helper}>其他设备在局域网中看到的名字</p>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-receive-dir">
                接收目录
              </label>
              <div className={styles.inputRow}>
                <Input
                  id="settings-receive-dir"
                  type="text"
                  value={state.receiveDir}
                  onChange={handleReceiveDirChange}
                  icon={<FolderIcon />}
                />
                <Button variant="secondary" size="md" onClick={handleChooseDir}>
                  选择…
                </Button>
              </div>
              <p className={styles.helper}>通过局域网接收到的文件会保存到此目录</p>
            </div>
          </Card.Body>
        </Card>

        {/* Card 2: 快捷键 */}
        <Card variant="flat" padding="md">
          <Card.Header>
            <h2 className={styles.sectionTitle}>快捷键</h2>
          </Card.Header>
          <Card.Body padding="md">
            <div className={styles.shortcutList}>
              {state.shortcuts.map((s) => (
                <div key={s.id} className={styles.shortcutRow}>
                  <div className={styles.shortcutText}>
                    <span className={styles.shortcutLabel}>{s.label}</span>
                    <span className={styles.shortcutHelper}>{s.helper}</span>
                  </div>
                  <div className={styles.shortcutInput}>
                    <Input
                      type="text"
                      value={s.value}
                      onChange={(e) => handleShortcutChange(s.id, e.target.value)}
                      icon={<KeyboardIcon />}
                      mono
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card.Body>
        </Card>

        {/* Card 3: 同步与存储 */}
        <Card variant="flat" padding="md">
          <Card.Header>
            <h2 className={styles.sectionTitle}>同步与存储</h2>
          </Card.Header>
          <Card.Body padding="md">
            <div className={styles.toggleList}>
              {state.toggles.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={styles.toggleRow}
                  onClick={() => handleToggleClick(t.id)}
                  role="switch"
                  aria-checked={t.enabled}
                >
                  <div className={styles.toggleText}>
                    <span className={styles.toggleLabel}>{t.label}</span>
                    <span className={styles.toggleHelper}>{t.helper}</span>
                  </div>
                  <span className={styles.toggleState}>
                    {t.enabled ? (
                      <Pill tone="success" dot>
                        <CheckIcon size={12} />
                        启用
                      </Pill>
                    ) : (
                      <Pill tone="neutral" dot>
                        <XIcon size={12} />
                        禁用
                      </Pill>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </Card.Body>
        </Card>

        {/* Card 4: 关于 */}
        <Card variant="flat" padding="md">
          <Card.Header>
            <h2 className={styles.sectionTitle}>关于</h2>
          </Card.Header>
          <Card.Body padding="md">
            <dl className={styles.metaList}>
              <div className={styles.metaRow}>
                <dt className={styles.metaKey}>版本号</dt>
                <dd className={styles.metaValue}>
                  <Pill tone="accent">v{APP_VERSION}</Pill>
                </dd>
              </div>
              <div className={styles.metaRow}>
                <dt className={styles.metaKey}>构建日期</dt>
                <dd className={styles.metaValue}>{BUILD_DATE}</dd>
              </div>
              <div className={styles.metaRow}>
                <dt className={styles.metaKey}>更新来源</dt>
                <dd className={styles.metaValue}>GitHub Releases</dd>
              </div>
            </dl>
            <div className={styles.aboutActions}>
              <Button
                variant="secondary"
                size="md"
                icon={<SyncIcon />}
                onClick={() => {
                  // 真实环境会触发 updater 流程
                  // eslint-disable-next-line no-console
                  console.info('[Settings] 检查更新（mock）');
                }}
              >
                检查更新
              </Button>
              <span className={styles.aboutHint}>
                <InfoIcon size={14} />
                <span>当前为最新版本</span>
              </span>
            </div>
          </Card.Body>
        </Card>

        {/* 底部按钮组 */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {isDirty ? (
              <span className={styles.dirtyHint}>有未保存的修改</span>
            ) : savedAt ? (
              <span className={styles.savedHint}>已保存于 {formatTime(savedAt)}</span>
            ) : null}
          </div>
          <div className={styles.footerActions}>
            <Button variant="ghost" onClick={handleResetDefaults} disabled={!isDirty}>
              恢复默认
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={!isDirty}>
              保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 把 Date 格式化为 "HH:MM:SS" 字符串
 *
 * @param d Date 实例
 * @returns 时间字符串
 */
function formatTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

Settings.displayName = 'Settings';
