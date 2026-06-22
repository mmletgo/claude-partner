# 健康提醒模块 - Plan 2:体验完善 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**前置条件:** Plan 1(`2026-06-22-health-reminder-core.md`)核心闭环已实现并验证通过(health/ 模块、HealthRepo、HealthRuntime、7 命令、Health 页基础版、系统通知)。

**Goal:** 在 Plan 1 闭环之上补全体验:喝水提醒、应用内 toast 提醒(推迟/跳过)、全屏遮罩提醒、活动统计图表(app 排行 + 可视化)、完整配置表单。

**Architecture:** 全部基于 Plan 1 已建设施扩展——加水状态进 `HealthRuntime`、daemon 复用主 tick、提醒 UI 走前端(监听 `health:reminder`/`health:water`)、全屏遮罩复用截图模块透明窗口技术、图表用 recharts。

**Tech Stack:** Rust(Tauri 2 + sqlx)+ React 19 + TS + recharts(新增)+ @tauri-apps/plugin-notification。

**参考:** spec `docs/superpowers/specs/2026-06-22-health-reminder-design.md` §5/§6/§8。

## Global Constraints

继承 Plan 1 全部 Global Constraints(数据兼容 / serde camelCase / tracing / FFI 不写 #[link] / Send 边界 / 规则 29 注释 / i18n 不硬编码 / hooks 在 early return 前 / 分目录测试)。补充:

- **recharts 新依赖**:仅用于统计图表(Task 4);其余组件不引图表库。
- **透明窗口复用**:全屏遮罩(Task 3)复用 `screenshot/overlay.rs` 已验证的 `transparent(true)` + `always_on_top` + `macOSPrivateApi` 模式,**不新建窗口架构**。
- **配置增量加字段必须 `#[serde(default)]`**(兼容 Plan 1 落盘的 config.json)。

---

## File Structure

### 新建(后端)
- `src-tauri/src/health/water.rs` — 喝水计时状态 + 判定

### 新建(前端)
- `web/src/pages/Health/ReminderToast.tsx` — 应用内 toast(监听 health:reminder)
- `web/src/pages/Health/WaterToast.tsx` — 喝水 toast(监听 health:water)
- `web/src/pages/Health/StatsChart.tsx` — 统计图表(app 排行 + 可视化)
- `web/src/pages/Health/Settings.tsx` — 完整配置表单
- `web/src/pages/HealthOverlay.tsx` — 全屏遮罩页(路由 `/health-overlay`)

### 修改
- `src-tauri/src/health/mod.rs`(加 water 子模块 + 全屏开窗 + daemon 水判定)
- `src-tauri/src/config.rs`(HealthConfig 加 water_*/reminder_fullscreen)
- `src-tauri/src/commands/health.rs`(record_water / get_activity_detail / open_health_overlay)
- `src-tauri/src/lib.rs`(invoke_handler 注册新命令)
- `src-tauri/capabilities/default.json`(windows 加 `health-overlay-*`)
- `web/package.json`(recharts)
- `web/src/api/health.ts` + `lib/types.ts`(新方法/类型)
- `web/src/pages/Health/index.tsx`(集成图表 + 设置)
- `web/src/App.tsx`(/health-overlay 路由 + toast 挂载)

---

### Task 1: 喝水提醒(后端状态 + 命令 + daemon 集成)

**Files:**
- Create: `src-tauri/src/health/water.rs`
- Modify: `src-tauri/src/health/mod.rs`(HealthRuntime 加 water + daemon 判定)
- Modify: `src-tauri/src/config.rs`(HealthConfig 加 water 字段)
- Modify: `src-tauri/src/commands/health.rs`(record_water 命令)
- Modify: `src-tauri/src/lib.rs`(invoke_handler 注册)

**Interfaces:**
- Produces: `WaterState`、emit `health:water`、命令 `record_water`

- [ ] **Step 1: HealthConfig 加喝水字段**

在 `src-tauri/src/config.rs` 的 `HealthConfig` 加(均带 `#[serde(default)]`):

```rust
    #[serde(default = "default_true")]
    pub water_enabled: bool,
    #[serde(default = "default_water_interval")]
    pub water_interval_seconds: i64,
```
加默认函数 `fn default_water_interval() -> i64 { 60 * 60 }`,并在 `impl Default for HealthConfig` 补 `water_enabled: true, water_interval_seconds: 60*60,`。同步更新 `commands/health.rs` 的 `HealthConfigDto`/`update_health_config` 加这两个字段(camelCase:`waterEnabled`/`waterIntervalSeconds`),前端 `types.ts` 的 `HealthConfig` 同步。

- [ ] **Step 2: water.rs 状态 + 判定**

创建 `src-tauri/src/health/water.rs`:

```rust
//! 喝水提醒计时状态。pending_remind 防止未响应前每 tick 重复 emit。

/// 喝水运行时状态(放 HealthRuntime,跨 daemon 与命令共享)。
pub struct WaterState {
    pub last_drink_ts: i64,
    pub pending_remind: bool,
}
impl WaterState {
    pub fn new(now_ts: i64) -> Self { Self { last_drink_ts: now_ts, pending_remind: false } }
}

/// 是否该提醒喝水:启用 + 超过间隔 + 无未响应提醒。
pub fn should_remind_water(state: &WaterState, now_ts: i64, enabled: bool, interval: i64) -> bool {
    enabled && !state.pending_remind && (now_ts - state.last_drink_ts) >= interval
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remind_after_interval_when_enabled() {
        let s = WaterState::new(0);
        assert!(!should_remind_water(&s, 100, true, 3600));  // 未到间隔
        assert!(should_remind_water(&s, 3600, true, 3600));  // 到间隔
    }
    #[test]
    fn no_remind_when_pending() {
        let mut s = WaterState::new(0);
        s.pending_remind = true;
        assert!(!should_remind_water(&s, 99999, true, 3600));
    }
    #[test]
    fn no_remind_when_disabled() {
        let s = WaterState::new(0);
        assert!(!should_remind_water(&s, 99999, false, 3600));
    }
}
```

- [ ] **Step 3: HealthRuntime 加 water + daemon 集成**

在 `src-tauri/src/health/mod.rs`:
(a) 加 `pub mod water;` 与 `use self::water::{should_remind_water, WaterState};`
(b) `HealthRuntime` 加字段 `pub water: Mutex<WaterState>`,`new()` 内用 `WaterState::new(chrono::Utc::now().timestamp())`。
(c) `handle_sample` 末尾(数据清理前)加水判定:

```rust
    // 喝水提醒
    if should_remind_water(
        &state.health.water.lock().unwrap(),
        now, cfg.water_enabled, cfg.water_interval_seconds,
    ) {
        {
            let mut w = state.health.water.lock().unwrap();
            w.pending_remind = true;
        }
        let dnd = is_in_dnd(now, cfg.dnd_start.as_deref(), cfg.dnd_end.as_deref());
        if !dnd {
            let _ = app.emit("health:water", serde_json::json!({}));
        }
    }
```

- [ ] **Step 4: record_water 命令**

在 `src-tauri/src/commands/health.rs` 加:

```rust
#[tauri::command]
pub async fn record_water(state: State<'_, AppState>) -> Result<(), AppError> {
    let now = chrono::Utc::now().timestamp();
    {
        let mut w = state.health.water.lock().unwrap();
        w.last_drink_ts = now;
        w.pending_remind = false;
    }
    state.health_repo.insert_water(now).await?;
    Ok(())
}
```
在 `lib.rs` `generate_handler!` 加 `health_cmd::record_water,`。

- [ ] **Step 5: 测试 + Commit**

Run: `cd src-tauri && cargo test health::water && cargo build`
```bash
git add src-tauri/src/health/water.rs src-tauri/src/health/mod.rs src-tauri/src/config.rs src-tauri/src/commands/health.rs src-tauri/src/lib.rs
git commit -m "feat(health): 喝水提醒(WaterState 计时 + record_water 命令 + daemon emit health:water,TDD)"
```

---

### Task 2: 应用内 toast 提醒(ReminderToast + 喝水 toast)

**Files:**
- Create: `web/src/pages/Health/ReminderToast.tsx`
- Create: `web/src/pages/Health/WaterToast.tsx`
- Modify: `web/src/App.tsx`(挂载 toast)
- Modify: `web/src/api/health.ts` + `lib/types.ts`(recordWater)
- Modify: `web/src/i18n/locales/{en,zh}/health.json`(toast 文案)

**Interfaces:**
- Consumes: `healthApi.snooze`/`skip`/`recordWater`;listen `health:reminder`/`health:water`

- [ ] **Step 1: api/types 加 recordWater**

`api/health.ts` 加 `recordWater: () => invoke<void>('record_water'),`。

- [ ] **Step 2: ReminderToast 组件**

创建 `web/src/pages/Health/ReminderToast.tsx`(hooks 在 early return 前):

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { healthApi } from '@/api/health';

export default function ReminderToast() {
  const { t } = useTranslation(['health', 'common']);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unlisten = listen('health:reminder', () => setVisible(true));
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  if (!visible) return null;
  const close = () => setVisible(false);
  const snooze = async (min: number) => { await healthApi.snooze(min); close(); };
  const skip = async () => { await healthApi.skip(); close(); };

  return (
    <div style={{ position: 'fixed', right: 24, bottom: 24, background: '#fff', border: '1px solid #ddd',
                  borderRadius: 12, padding: 16, boxShadow: '0 8px 24px rgba(0,0,0,.15)', zIndex: 9999 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('health:reminderTitle')}</div>
      <div style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>{t('health:reminderBody')}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => snooze(5)}>{t('health:snooze5')}</button>
        <button onClick={() => snooze(10)}>{t('health:snooze10')}</button>
        <button onClick={skip}>{t('health:skip')}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: WaterToast 组件**

创建 `web/src/pages/Health/WaterToast.tsx`(同构,监听 `health:water`,按钮「已喝水」调 `recordWater`):

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { healthApi } from '@/api/health';

export default function WaterToast() {
  const { t } = useTranslation(['health', 'common']);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const unlisten = listen('health:water', () => setVisible(true));
    return () => { void unlisten.then((fn) => fn()); };
  }, []);
  if (!visible) return null;
  const drank = async () => { await healthApi.recordWater(); setVisible(false); };
  return (
    <div style={{ position: 'fixed', right: 24, bottom: 110, background: '#eef6ff', border: '1px solid #b6d4ff',
                  borderRadius: 12, padding: 16, boxShadow: '0 8px 24px rgba(0,0,0,.15)', zIndex: 9999 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>💧 {t('health:waterTitle')}</div>
      <div style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>{t('health:waterBody')}</div>
      <button onClick={drank}>{t('health:drank')}</button>
    </div>
  );
}
```

- [ ] **Step 4: i18n 文案**

`zh/health.json` 加:`"snooze5": "推迟 5 分钟"`, `"snooze10": "推迟 10 分钟"`, `"skip": "跳过本次"`, `"waterTitle": "该喝水啦 💧"`, `"waterBody": "记得补充水分,喝口水再继续。", "drank": "已喝水"`(en 对应翻译)。

- [ ] **Step 5: App.tsx 挂载 toast**

在 `App.tsx` 的 `AppShell` 布局内(或 `App` `<>` 内合适位置,确保仅在主窗口显示)挂 `<ReminderToast />` 与 `<WaterToast />`(import 两个组件)。
> 注:toast 应在主窗口常驻渲染,故放在 AppShell 内层(非 overlay 路由)。若 App.tsx 顶层挂载会覆盖 overlay 页,需用路由守卫——简单起见放在 AppShell 组件内。

- [ ] **Step 6: 类型检查 + Commit**

Run: `cd web && npx tsc --noEmit`
```bash
git add web/src/pages/Health/ReminderToast.tsx web/src/pages/Health/WaterToast.tsx web/src/api/health.ts web/src/App.tsx web/src/i18n
git commit -m "feat(health): 应用内 toast 提醒(久坐推迟/跳过 + 喝水已喝水)"
```

---

### Task 3: 全屏遮罩提醒(HealthOverlay,复用截图透明窗口)

**Files:**
- Modify: `src-tauri/src/health/mod.rs`(`open_health_overlay` 开窗 + emit 时触发)
- Modify: `src-tauri/src/commands/health.rs` 或 `mod.rs`(open_health_overlay 命令)
- Modify: `src-tauri/src/config.rs`(HealthConfig 加 reminder_fullscreen)
- Modify: `src-tauri/capabilities/default.json`(windows 加 `health-overlay-*`)
- Modify: `src-tauri/src/lib.rs`(invoke_handler)
- Create: `web/src/pages/HealthOverlay.tsx`
- Modify: `web/src/App.tsx`(`/health-overlay` 路由,顶层非守卫)

**Interfaces:**
- Produces: 命令 `open_health_overlay`;`/health-overlay` 页

- [ ] **Step 1: HealthConfig 加 reminder_fullscreen + capabilities**

`config.rs` 的 `HealthConfig` 加 `#[serde(default)] pub reminder_fullscreen: bool;`(default false),`impl Default` 补 `reminder_fullscreen: false`。同步 Dto/前端 types。
`capabilities/default.json` 的 `windows` 数组加 `"health-overlay-*"`(参照现有 `"screenshot-overlay-*"`)。

- [ ] **Step 2: open_health_overlay 开窗(复用截图模式)**

在 `src-tauri/src/health/mod.rs` 加(参照 `screenshot/overlay.rs::start_region_capture` 的窗口构建,但单窗全屏):

```rust
use tauri::{WebviewWindowBuilder, Manager};

/// 打开全屏健康提醒遮罩窗口(每屏一个,复用截图透明窗口模式)。
pub fn open_health_overlay(app: &AppHandle) -> Result<(), AppError> {
    let monitors = xcap::Monitor::all().map_err(|e| AppError::generic(format!("枚举显示器失败: {e}")))?;
    for (i, m) in monitors.iter().enumerate() {
        let label = format!("health-overlay-{i}");
        if app.get_webview_window(&label).is_some() { continue; } // 已开则跳过
        let win = WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App(format!("/health-overlay?display={i}").into()))
            .title("健康提醒")
            .position(m.x() as f64, m.y() as f64)
            .inner_size(m.width() as f64, m.height() as f64)
            .decorations(false).transparent(true).always_on_top(true)
            .focused(true).skip_taskbar(true).resizable(false)
            .build()?;
        let _ = win.set_ignore_cursor_events(false);
    }
    Ok(())
}

/// 关闭所有全屏遮罩窗口。
pub fn close_health_overlay(app: &AppHandle) {
    for win in app.webview_windows() {
        if win.0.starts_with("health-overlay-") { let _ = win.1.close(); }
    }
}
```
> 几何直接用 `monitor.x()/y()/width()/height()`(逻辑点,不除 scale,与截图 overlay 一致)。transparent 需 `macOSPrivateApi`(已开)。

- [ ] **Step 3: emit 时按 reminder_fullscreen 开窗**

在 `mod.rs` 的 `handle_sample` 的 `health:reminder` emit 分支,改为:

```rust
        if !snoozed && !dnd && cfg.notify_enabled {
            let _ = app.emit("health:reminder", serde_json::json!({ "workWindowSeconds": cfg.work_window_seconds }));
            if cfg.reminder_fullscreen {
                if let Err(e) = open_health_overlay(app) { tracing::warn!("打开全屏遮罩失败: {e}"); }
            }
        }
```

- [ ] **Step 4: 命令 + 注册**

`commands/health.rs` 加 `close_health_overlay` 命令(供前端遮罩页「关闭」调用):

```rust
#[tauri::command]
pub async fn close_health_overlay(app: tauri::AppHandle) -> Result<(), AppError> {
    crate::health::close_health_overlay(&app);
    Ok(())
}
```
`lib.rs` `generate_handler!` 加 `health_cmd::close_health_overlay,`。

- [ ] **Step 5: HealthOverlay.tsx 前端页**

创建 `web/src/pages/HealthOverlay.tsx`(独立于 AppShell,类比 `Screenshot/Overlay.tsx`,onMount 强制透明):

```tsx
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';

export default function HealthOverlay() {
  const { t } = useTranslation(['health', 'common']);
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);
  const close = async (snoozeMin?: number) => {
    if (snoozeMin) await invoke('snooze_reminder', { minutes: snoozeMin });
    else await invoke('skip_reminder');
    await invoke('close_health_overlay');
  };
  return (
    <div style={{ width: '100vw', height: '100vh', background: 'rgba(0,0,0,.55)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 48, marginBottom: 16 }}>🌿 {t('health:reminderTitle')}</h1>
        <p style={{ fontSize: 20, marginBottom: 32 }}>{t('health:reminderBody')}</p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <button onClick={() => close(5)}>{t('health:snooze5')}</button>
          <button onClick={() => close(10)}>{t('health:snooze10')}</button>
          <button onClick={() => close()}>{t('health:skip')}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: App.tsx 加路由(顶层非守卫)**

在 `App.tsx` 与 `<Route path="/screenshot-overlay" ...>` 同级(顶层,不在 OnboardingGuard 内)加:`<Route path="/health-overlay" element={<HealthOverlay />} />`,import `HealthOverlay`。

- [ ] **Step 7: 编译 + 类型检查 + Commit**

Run: `cd src-tauri && cargo build && cd ../web && npx tsc --noEmit`
```bash
git add src-tauri/src/health/mod.rs src-tauri/src/commands/health.rs src-tauri/src/config.rs src-tauri/src/lib.rs src-tauri/capabilities/default.json web/src/pages/HealthOverlay.tsx web/src/App.tsx web/src/lib/types.ts
git commit -m "feat(health): 全屏遮罩提醒(复用截图透明窗口,reminder_fullscreen 开关)"
```

<!-- PLAN_PART2 -->