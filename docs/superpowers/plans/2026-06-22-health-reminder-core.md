# 健康提醒模块 - Plan 1:核心监测闭环 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 claude-partner 中落地可用的久坐提醒闭环——键鼠活动监测 → 工作/休息状态机 → 连续工作满窗口且无有效休息时发系统通知提醒,前端 Health 页签展示状态与基础配置。

**Architecture:** 后端主导。新增 `src-tauri/src/health/` 模块(采样 monitor + 纯算法状态机 state + 提醒生命周期 reminder + 存储 health_repo + 后台 daemon),复用现有 `cc/collector.rs` 的 `tokio::spawn + interval + select!{cancel}` 后台任务范式;配置挂 `AppConfig.health`;权限复用 `permissions/` 加 accessibility;前端新增 `/health` 页签 + 顶层 `health:reminder` 监听。

**Tech Stack:** Rust(Tauri 2 + sqlx + device_query/rdev/active-win-pos-rs + tauri-plugin-notification/autostart)+ React 19 + TS + react-i18next。

**参考 spec:** `docs/superpowers/specs/2026-06-22-health-reminder-design.md`

## Global Constraints

- **数据兼容**:直接读写旧 `~/.claude-partner/data.db`,建表全用 `CREATE TABLE IF NOT EXISTS`;`AppConfig.health` 字段必须 `#[serde(default)]`,兼容无该字段的旧 `config.json`(规则:数据兼容)。
- **serde 对齐前端**:返回前端的 struct 一律 `#[serde(rename_all = "camelCase")]`;前端 invoke 参数 camelCase(Tauri 自动转 snake_case)。
- **日志用 `tracing`**,禁止 `tauri-plugin-log`(与 tracing_subscriber 冲突 panic)。
- **macOS 权限 FFI 不写 `#[link]`**:framework 已被 Tauri 依赖链链接,用 `extern "C"` 直接声明符号(对照现有 screen capture / input monitoring 写法)。
- **后台任务 Send 边界**:跨 `await` 不持 `RwLockReadGuard`,先 clone 字段再 await(对照 M5 传输入坑)。
- **所有新增 Rust 函数按规则 29 加 `Business Logic` + `Code Logic` 中文 docstring**;Python 类型严格(此处为 Rust,等价为完整类型标注)。
- **i18n 硬规则**:禁止组件内硬编码用户可见中英文,一律走 `src/i18n/locales/{en,zh}/health.json` + `t('health:key')`。
- **hooks 在 early return 之前**(规则 20)。
- **测试命令**:`cd src-tauri && cargo test` / `cargo clippy` / `cargo build`;`cd web && npx tsc --noEmit` / `npm run lint`(分目录,规则 23)。

---

## File Structure

### 新建文件(后端)
- `src-tauri/src/health/mod.rs` — 模块门面 + `HealthState`(运行时状态)+ `start_health_daemon`(后台 task)
- `src-tauri/src/health/state.rs` — 工作/休息状态机(纯算法,无 IO,可单测)
- `src-tauri/src/health/monitor.rs` — 键鼠采样 `trait ActivitySampler` + 跨平台真实实现
- `src-tauri/src/health/reminder.rs` — 提醒生命周期 + 免打扰时段判定(纯逻辑,可单测)
- `src-tauri/src/storage/health_repo.rs` — sqlx:activity_records / water_records 增查聚合清理
- `src-tauri/src/commands/health.rs` — `#[tauri::command]` 命令层

### 新建文件(前端)
- `web/src/api/health.ts` — invoke 封装
- `web/src/pages/Health/index.tsx` — Health 页主体(状态 + 开关 + 基础设置)
- `web/src/i18n/locales/en/health.json` / `zh/health.json` — 文案

### 修改文件(后端)
- `src-tauri/Cargo.toml` — 加依赖
- `src-tauri/src/config.rs` — `AppConfig.health: HealthConfig`
- `src-tauri/src/state.rs` — AppState 加 health 运行时字段
- `src-tauri/src/lib.rs` — 建表 schema + setup 启动 daemon + invoke_handler 注册 + RunEvent::Exit + plugin 注册
- `src-tauri/src/storage/mod.rs` — `pub mod health_repo`
- `src-tauri/src/commands/mod.rs` — `pub mod health`
- `src-tauri/src/permissions/mod.rs` — accessibility 检测 + `PermissionsStatus` 加字段
- `src-tauri/src/tray.rs` — 「暂停/恢复监测」菜单项
- `src-tauri/capabilities/default.json` — `notification:default` + `autostart:default` + `health-overlay-*`(Plan 2 用,先加通配)
- `src-tauri/tauri.conf.json` — (notification 无需 conf;autostart 无需 conf;此文件 Plan 1 不改)

### 修改文件(前端)
- `web/src/lib/types.ts` — Health 相关 interface
- `web/src/App.tsx` — `/health` 路由 + 顶层 `health:reminder` 监听
- `web/src/components/layout/AppShell/AppShell.tsx` — 加 Health 导航项
- `web/src/lib/icons.tsx`(或对应 icons 文件)— `HealthIcon`
- `web/src/i18n/index.ts` — 注册 health namespace
- `web/src/i18n/locales/{en,zh}/nav.json` — `health` key

---

### Task 1: 依赖 + HealthConfig 配置类型

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/config.rs`
- Test: `src-tauri/src/config.rs`(inline `#[cfg(test)]` 模块)

**Interfaces:**
- Produces: `HealthConfig` struct(供 Task 2/6/7/9 使用);`AppConfig.health` 字段(`#[serde(default)]`)

- [ ] **Step 1: 加 Cargo 依赖**

在 `src-tauri/Cargo.toml` `[dependencies]` 末尾(`tauri-plugin-process = "2"` 之后)追加:

```toml
# M10 健康提醒:device_query(macOS 键鼠状态查询)、rdev(Windows/Linux 全局事件)、
# active-win-pos-rs(活动窗口标题/进程名)、notification(系统通知)、autostart(开机自启)
device_query = "1.1"
rdev = "0.5"
active-win-pos-rs = "0.10"
tauri-plugin-notification = "2"
tauri-plugin-autostart = "2"
```

- [ ] **Step 2: 定义 HealthConfig + 扩展 AppConfig**

在 `src-tauri/src/config.rs` `AppConfig` struct 定义**之前**加入 `HealthConfig`,并把 `health` 字段加入 `AppConfig`:

```rust
/// 健康提醒配置(久坐监测 + 喝水提醒)。
///
/// `#[serde(default)]` 保证旧 config.json(无 health 字段)反序列化时回退默认值,兼容历史用户。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthConfig {
    /// 久坐监测总开关,默认开启(用户决策:装好即生效)
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// 工作窗口长度(秒),默认 45 分钟
    #[serde(default = "default_work_window")]
    pub work_window_seconds: i64,
    /// 有效休息判定时长(秒),默认 5 分钟(连续无操作达此值才算休息)
    #[serde(default = "default_break")]
    pub break_seconds: i64,
    /// 是否记录窗口标题(最细粒度统计),默认开;关闭则降级到「只记进程名」
    #[serde(default = "default_true")]
    pub record_window_title: bool,
    /// 明细保留天数,默认 90;超期清理
    #[serde(default = "default_retain_days")]
    pub retain_days: i64,
    /// 系统通知提醒开关(Plan 1 唯一提醒方式)
    #[serde(default = "default_true")]
    pub notify_enabled: bool,
    /// 免打扰开始 "HH:MM"(含),None 表示无免打扰
    #[serde(default)]
    pub dnd_start: Option<String>,
    /// 免打扰结束 "HH:MM"(不含),支持跨午夜(如 22:00-07:00)
    #[serde(default)]
    pub dnd_end: Option<String>,
}

impl Default for HealthConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            work_window_seconds: 45 * 60,
            break_seconds: 5 * 60,
            record_window_title: true,
            retain_days: 90,
            notify_enabled: true,
            dnd_start: None,
            dnd_end: None,
        }
    }
}

fn default_true() -> bool { true }
fn default_work_window() -> i64 { 45 * 60 }
fn default_break() -> i64 { 5 * 60 }
fn default_retain_days() -> i64 { 90 }
```

在 `AppConfig` struct 内,**最后一行字段 `pub screenshot_hotkey: String,` 之后**加(注意 `#[serde(default)]` 整体修饰该字段):

```rust
    #[serde(default)]
    pub health: HealthConfig,
```

- [ ] **Step 3: 写失败测试 —— 旧 config 兼容 + 默认值 + 往返**

在 `src-tauri/src/config.rs` 文件末尾追加:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_config_defaults() {
        let h = HealthConfig::default();
        assert!(h.enabled);
        assert_eq!(h.work_window_seconds, 45 * 60);
        assert_eq!(h.break_seconds, 5 * 60);
        assert!(h.record_window_title);
        assert_eq!(h.retain_days, 90);
        assert!(h.dnd_start.is_none());
    }

    #[test]
    fn test_old_config_without_health_field_loads_with_defaults() {
        // 模拟迁移前无 health 字段的旧 config.json
        let old_json = r#"{
            "device_id":"dev_x","device_name":"mac","http_port":0,
            "receive_dir":"/tmp","db_path":"/tmp/data.db","screenshot_hotkey":"<cmd>+<shift>+s"
        }"#;
        let cfg: AppConfig = serde_json::from_str(old_json).unwrap();
        assert!(cfg.health.enabled, "旧 config 缺 health 字段时应回退默认 enabled=true");
        assert_eq!(cfg.health.work_window_seconds, 45 * 60);
    }

    #[test]
    fn test_health_config_roundtrip() {
        let cfg = AppConfig {
            device_id: "d".into(), device_name: "n".into(), http_port: 0,
            receive_dir: "/r".into(), db_path: "/db".into(), screenshot_hotkey: "<cmd>+s".into(),
            health: HealthConfig { enabled: false, work_window_seconds: 30*60, break_seconds: 3*60,
                record_window_title: false, retain_days: 30, notify_enabled: false,
                dnd_start: Some("22:00".into()), dnd_end: Some("07:00".into()) },
        };
        let json = serde_json::to_string(&cfg).unwrap();
        let back: AppConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.health.work_window_seconds, 30 * 60);
        assert!(!back.health.enabled);
        assert_eq!(back.health.dnd_start.as_deref(), Some("22:00"));
    }
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `cd src-tauri && cargo test config::tests -- --nocapture`
Expected: 3 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/config.rs
git commit -m "feat(health): 加 HealthConfig 配置类型 + 依赖(device_query/rdev/active-win-pos-rs/notification/autostart)"
```

---

### Task 2: DB 表 + HealthRepo 存储

**Files:**
- Modify: `src-tauri/src/lib.rs`(加 schema 常量 + init_db 执行)
- Create: `src-tauri/src/storage/health_repo.rs`
- Modify: `src-tauri/src/storage/mod.rs`(`pub mod health_repo`)
- Test: `src-tauri/src/storage/health_repo.rs`(inline `#[cfg(test)]`)

**Interfaces:**
- Consumes: `SqlitePool`(来自 lib.rs init_db)、`AppError`(`error.rs`)
- Produces: `HealthRepo`、`ActivityRecord`、方法:`insert_activity` / `get_activities_since` / `aggregate_minutes` / `cleanup_older_than` / `insert_water`

- [ ] **Step 1: 加建表 schema 并在 init_db 执行**

在 `src-tauri/src/lib.rs` 现有 schema 常量区(如 `CLAUDE_MD_SCHEMA` 附近)加:

```rust
const HEALTH_SCHEMA: &str = "CREATE TABLE IF NOT EXISTS activity_records (
    ts INTEGER PRIMARY KEY,
    is_active INTEGER NOT NULL,
    process_name TEXT,
    window_title TEXT
)";

const WATER_SCHEMA: &str = "CREATE TABLE IF NOT EXISTS water_records (
    ts INTEGER PRIMARY KEY
)";
```

在 `init_db` 函数内,现有 `sqlx::query(CLAUDE_MD_SCHEMA).execute(&pool).await?;` 之后加:

```rust
    sqlx::query(HEALTH_SCHEMA).execute(&pool).await?;
    sqlx::query(WATER_SCHEMA).execute(&pool).await?;
```

- [ ] **Step 2: 写 storage/health_repo.rs 完整实现**

创建 `src-tauri/src/storage/health_repo.rs`:

```rust
//! 健康提醒模块的 SQLite 存储:每分钟活动记录 + 喝水记录。

use sqlx::{Row, SqlitePool};
use crate::error::AppError;

/// 单分钟活动采样行。
#[derive(Debug, Clone)]
pub struct ActivityRecord {
    pub ts: i64,                       // 分钟级 unix 时间戳
    pub is_active: bool,
    pub process_name: Option<String>,
    pub window_title: Option<String>,
}

/// health 模块数据库访问对象。
pub struct HealthRepo {
    db: SqlitePool,
}

impl HealthRepo {
    /// 构造,传入共享连接池。
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    /// 写入一条分钟级活动记录。ts 冲突时用 INSERT OR REPLACE 覆盖(同一分钟重采)。
    pub async fn insert_activity(&self, r: &ActivityRecord) -> Result<(), AppError> {
        sqlx::query(
            "INSERT OR REPLACE INTO activity_records (ts, is_active, process_name, window_title) \
             VALUES (?, ?, ?, ?)",
        )
        .bind(r.ts)
        .bind(r.is_active as i64)
        .bind(r.process_name.as_deref())
        .bind(r.window_title.as_deref())
        .execute(&self.db)
        .await?;
        Ok(())
    }

    /// 取 [since_ts, now] 区间内的活动记录(用于统计)。
    pub async fn get_activities_since(&self, since_ts: i64) -> Result<Vec<ActivityRecord>, AppError> {
        let rows = sqlx::query(
            "SELECT ts, is_active, process_name, window_title FROM activity_records WHERE ts >= ? ORDER BY ts",
        )
        .bind(since_ts)
        .fetch_all(&self.db)
        .await?;
        rows.iter()
            .map(|row| {
                Ok(ActivityRecord {
                    ts: row.try_get("ts")?,
                    is_active: row.try_get::<i64, _>("is_active")? != 0,
                    process_name: row.try_get("process_name")?,
                    window_title: row.try_get("window_title")?,
                })
            })
            .collect()
    }

    /// 统计 [since_ts, now] 内活跃 / 非活跃分钟数。返回 (active_minutes, idle_minutes)。
    pub async fn aggregate_minutes(&self, since_ts: i64) -> Result<(i64, i64), AppError> {
        let row = sqlx::query(
            "SELECT \
                SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) AS active, \
                SUM(CASE WHEN is_active=0 THEN 1 ELSE 0 END) AS idle \
             FROM activity_records WHERE ts >= ?",
        )
        .bind(since_ts)
        .fetch_optional(&self.db)
        .await?;
        match row {
            Some(r) => {
                let active: i64 = r.try_get("active").ok().unwrap_or(0);
                let idle: i64 = r.try_get("idle").ok().unwrap_or(0);
                Ok((active, idle))
            }
            None => Ok((0, 0)),
        }
    }

    /// 删除 ts < cutoff 的明细(数据清理,控制库体积)。
    pub async fn cleanup_older_than(&self, cutoff_ts: i64) -> Result<u64, AppError> {
        let res = sqlx::query("DELETE FROM activity_records WHERE ts < ?")
            .bind(cutoff_ts)
            .execute(&self.db)
            .await?;
        Ok(res.rows_affected())
    }

    /// 记录一次喝水。
    pub async fn insert_water(&self, ts: i64) -> Result<(), AppError> {
        sqlx::query("INSERT OR REPLACE INTO water_records (ts) VALUES (?)")
            .bind(ts)
            .execute(&self.db)
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 构造内存库并建表,供单测复用。
    async fn setup_db() -> SqlitePool {
        let options = sqlx::sqlite::SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .create_if_missing(true);
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE IF NOT EXISTS activity_records (ts INTEGER PRIMARY KEY, is_active INTEGER NOT NULL, process_name TEXT, window_title TEXT)").execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE IF NOT EXISTS water_records (ts INTEGER PRIMARY KEY)").execute(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn test_insert_and_aggregate() {
        let pool = setup_db().await;
        let repo = HealthRepo::new(pool);
        repo.insert_activity(&ActivityRecord { ts: 1000, is_active: true, process_name: Some("code".into()), window_title: None }).await.unwrap();
        repo.insert_activity(&ActivityRecord { ts: 1001, is_active: true, process_name: None, window_title: None }).await.unwrap();
        repo.insert_activity(&ActivityRecord { ts: 1002, is_active: false, process_name: None, window_title: None }).await.unwrap();
        let (active, idle) = repo.aggregate_minutes(0).await.unwrap();
        assert_eq!(active, 2);
        assert_eq!(idle, 1);
    }

    #[tokio::test]
    async fn test_cleanup() {
        let pool = setup_db().await;
        let repo = HealthRepo::new(pool);
        repo.insert_activity(&ActivityRecord { ts: 1, is_active: true, process_name: None, window_title: None }).await.unwrap();
        repo.insert_activity(&ActivityRecord { ts: 100, is_active: true, process_name: None, window_title: None }).await.unwrap();
        let n = repo.cleanup_older_than(50).await.unwrap();
        assert_eq!(n, 1);
        let recs = repo.get_activities_since(0).await.unwrap();
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].ts, 100);
    }

    #[tokio::test]
    async fn test_water_record() {
        let pool = setup_db().await;
        let repo = HealthRepo::new(pool);
        repo.insert_water(9999).await.unwrap();
        // 不 panic 即通过(INSERT OR REPLACE 幂等)
        repo.insert_water(9999).await.unwrap();
    }
}
```

- [ ] **Step 3: 在 storage/mod.rs 注册模块**

在 `src-tauri/src/storage/mod.rs` 加(参照现有 `pub mod prompt_repo;`):

```rust
pub mod health_repo;
```

并在该文件顶部 `use` 区导出 `HealthRepo`、`ActivityRecord`(若 mod.rs 有 pub use 聚合则加;无则各处用全路径 `storage::health_repo::HealthRepo`)。

- [ ] **Step 4: 运行测试**

Run: `cd src-tauri && cargo test storage::health_repo -- --nocapture`
Expected: 3 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/storage/health_repo.rs src-tauri/src/storage/mod.rs
git commit -m "feat(health): activity_records/water_records 建表 + HealthRepo CRUD/聚合/清理(TDD)"
```

---

### Task 3: 工作/休息状态机(纯算法,TDD 重点)

**Files:**
- Create: `src-tauri/src/health/state.rs`
- Create: `src-tauri/src/health/mod.rs`(先建空门面,后续 Task 6 填充)
- Modify: `src-tauri/src/lib.rs`(`pub mod health;`)

**Interfaces:**
- Consumes: `HealthConfig.work_window_seconds` / `break_seconds`(经 `HealthThresholds` 传入)
- Produces: `HealthStateMachine`、`MachineState`、`StateOutcome`、`HealthThresholds`;方法 `HealthStateMachine::new()` / `.advance(active, now_ts, &thresholds) -> StateOutcome`

- [ ] **Step 1: 建 health 模块门面**

创建 `src-tauri/src/health/mod.rs`:

```rust
//! 健康提醒模块:键鼠监测 + 工作/休息状态机 + 提醒触发。
//!
//! 子模块:
//! - `state`:工作/休息状态机(纯算法)
//! - `monitor`:键鼠采样(跨平台)
//! - `reminder`:提醒生命周期 + 免打扰
//! - daemon 入口 `start_health_daemon`(Task 6 实现)

pub mod state;
```

在 `src-tauri/src/lib.rs` 顶部 `mod` 声明区(如 `mod storage;` 附近)加:

```rust
pub mod health;
```

- [ ] **Step 2: 写失败测试**

创建 `src-tauri/src/health/state.rs`,先只写测试桩 + 类型,使其编译失败(advance 未实现):

```rust
//! 工作/休息状态机:每分钟喂入「是否活跃」推进状态,输出当前状态 + 是否应触发久坐提醒。
//!
//! 核心概念:
//! - 工作窗口:从首次键鼠活动起的连续工作时段
//! - 有效休息:连续无操作 ≥ break_seconds 才中断工作窗口;短暂停歇不中断

#[cfg(test)]
mod tests {
    use super::*;

    fn thr() -> HealthThresholds {
        HealthThresholds { work_window_seconds: 45 * 60, break_seconds: 5 * 60 }
    }

    #[test]
    fn idle_to_working_on_first_activity() {
        let mut m = HealthStateMachine::new();
        let out = m.advance(true, 1000, &thr());
        assert!(matches!(out.state, MachineState::Working(_)));
        assert!(!out.should_remind);
    }

    #[test]
    fn short_pause_does_not_break_window() {
        let mut m = HealthStateMachine::new();
        m.advance(true, 1000, &thr());           // 开始工作
        m.advance(true, 1000 + 60, &thr());      // 1 分钟后活跃
        // 停 3 分钟(< break 5 分钟):应仍 Working
        let out = m.advance(false, 1000 + 60 + 180, &thr());
        assert!(matches!(out.state, MachineState::Working(_)));
        assert!(out.reminder_closed_window.is_none());
    }

    #[test]
    fn long_pause_closes_window_and_enters_resting() {
        let mut m = HealthStateMachine::new();
        m.advance(true, 1000, &thr());
        m.advance(true, 1060, &thr());
        // 停 5 分钟(>= break):应进 Resting 并关闭窗口
        let out = m.advance(false, 1060 + 300, &thr());
        assert!(matches!(out.state, MachineState::Resting { .. }));
        assert!(out.reminder_closed_window.is_some(), "应报告被关闭的工作窗口");
    }

    #[test]
    fn resting_to_working_starts_new_window() {
        let mut m = HealthStateMachine::new();
        m.advance(true, 1000, &thr());
        m.advance(false, 1000 + 300, &thr()); // 进 Resting
        let out = m.advance(true, 1000 + 600, &thr()); // 重新活跃
        assert!(matches!(out.state, MachineState::Working(_)));
    }

    #[test]
    fn remind_when_window_exceeds_threshold_without_rest() {
        let mut m = HealthStateMachine::new();
        let t = HealthThresholds { work_window_seconds: 120, break_seconds: 300 };
        m.advance(true, 0, &t);
        // 连续活跃到窗口满 120s
        let out = m.advance(true, 120, &t);
        assert!(out.should_remind, "窗口满且未休息应触发提醒");
    }

    #[test]
    fn do_not_remind_twice_in_same_window() {
        let mut m = HealthStateMachine::new();
        let t = HealthThresholds { work_window_seconds: 120, break_seconds: 300 };
        m.advance(true, 0, &t);
        let _ = m.advance(true, 120, &t);   // 已提醒
        let out = m.advance(true, 200, &t);
        assert!(!out.should_remind, "同窗口不重复提醒");
    }

    #[test]
    fn remind_again_after_rest_and_new_window() {
        let mut m = HealthStateMachine::new();
        let t = HealthThresholds { work_window_seconds: 120, break_seconds: 300 };
        m.advance(true, 0, &t);
        let _ = m.advance(true, 120, &t);   // 提醒 1
        m.advance(false, 120 + 300, &t);    // 有效休息
        let out = m.advance(true, 120 + 600, &t); // 新窗口
        let out = m.advance(true, 120 + 600 + 120, &t); // 新窗口满
        assert!(out.should_remind, "新窗口应能再次提醒");
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd src-tauri && cargo test health::state -- --nocapture`
Expected: 编译失败(`HealthThresholds` / `MachineState` / `HealthStateMachine` 未定义)。

- [ ] **Step 4: 实现状态机**

在 `src-tauri/src/health/state.rs` 测试模块**之前**加入实现:

```rust
/// 状态机判定阈值(从 HealthConfig 投影而来,解耦配置结构)。
#[derive(Debug, Clone, Copy)]
pub struct HealthThresholds {
    pub work_window_seconds: i64,
    pub break_seconds: i64,
}

/// 工作窗口运行时状态。
#[derive(Debug, Clone, PartialEq)]
pub struct WorkingState {
    pub window_start_ts: i64,
    pub last_active_ts: i64,
    pub reminded: bool,
}

/// 状态机当前相位。
#[derive(Debug, Clone, PartialEq)]
pub enum MachineState {
    Idle,
    Working(WorkingState),
    Resting { rest_start_ts: i64 },
}

/// 一次推进的输出。
#[derive(Debug, Clone)]
pub struct StateOutcome {
    pub state: MachineState,
    /// 转入 Resting 时,被关闭的工作窗口 (start_ts, end_ts),供入库统计;否则 None。
    pub reminder_closed_window: Option<(i64, i64)>,
    pub should_remind: bool,
}

/// 工作/休息状态机。无 IO、无时钟依赖,由外部每分钟喂入 (active, now_ts) 推进。
pub struct HealthStateMachine {
    pub state: MachineState,
}

impl HealthStateMachine {
    pub fn new() -> Self {
        Self { state: MachineState::Idle }
    }

    /// 推进一拍。
    ///
    /// active: 本分钟是否有键鼠活动;now_ts: 当前秒级时间戳;cfg: 阈值。
    pub fn advance(&mut self, active: bool, now_ts: i64, cfg: &HealthThresholds) -> StateOutcome {
        let mut closed_window: Option<(i64, i64)> = None;

        // 1) 相位流转
        let next = match (&self.state, active) {
            (MachineState::Idle, true)
            | (MachineState::Resting { .. }, true) => {
                MachineState::Working(WorkingState { window_start_ts: now_ts, last_active_ts: now_ts, reminded: false })
            }
            (MachineState::Working(w), true) => {
                MachineState::Working(WorkingState { last_active_ts: now_ts, ..w.clone() })
            }
            (MachineState::Idle, false) | (MachineState::Resting { .. }, false) => self.state.clone(),
            (MachineState::Working(w), false) => {
                if now_ts - w.last_active_ts >= cfg.break_seconds {
                    closed_window = Some((w.window_start_ts, now_ts));
                    MachineState::Resting { rest_start_ts: now_ts }
                } else {
                    self.state.clone() // 短暂停歇,保持 Working
                }
            }
        };

        // 2) 提醒判定(仅 Working 态,窗口自然时长达标且本窗口未提醒过)
        let mut should_remind = false;
        let final_state = if let MachineState::Working(w) = &next {
            if !w.reminded && now_ts - w.window_start_ts >= cfg.work_window_seconds {
                should_remind = true;
                MachineState::Working(WorkingState { reminded: true, ..w.clone() })
            } else {
                next.clone()
            }
        } else {
            next
        };

        self.state = final_state.clone();
        StateOutcome { state: final_state, reminder_closed_window: closed_window, should_remind }
    }
}

impl Default for HealthStateMachine {
    fn default() -> Self { Self::new() }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd src-tauri && cargo test health::state -- --nocapture`
Expected: 7 个测试 PASS。

- [ ] **Step 6: clippy + Commit**

Run: `cd src-tauri && cargo clippy -- -D warnings`(若仅有 health 相关 warning 则修;既有无关 warning 可忽略)

```bash
git add src-tauri/src/health/state.rs src-tauri/src/health/mod.rs src-tauri/src/lib.rs
git commit -m "feat(health): 工作/休息状态机纯算法(四态流转 + 久坐提醒触发,TDD 7 测)"
```

### Task 4: 键鼠采样 monitor.rs(跨平台 + 可测 trait)

**Files:**
- Create: `src-tauri/src/health/monitor.rs`
- Modify: `src-tauri/src/health/mod.rs`(加 `pub mod monitor;`)

**Interfaces:**
- Produces: `ActivitySample`、`trait ActivitySampler`、`MockSampler`(测试)、`DeviceQuerySampler`(真实)

> **设计决策(偏离 spec)**:统一用 `device_query` 轮询查询键鼠状态,取代 spec 的「macOS device_query / Win·Linux rdev」混合方案。理由:device_query 1.x 三平台均支持轮询(`MouseState.coords` + `get_keys()`),实现统一、依赖更少。`rdev` 依赖保留但 Plan 1 不用。

- [ ] **Step 1: 写 monitor.rs**

创建 `src-tauri/src/health/monitor.rs`:

```rust
//! 键鼠活动采样:trait ActivitySampler + device_query 跨平台真实实现。
//! 每次采样对比上次鼠标坐标/按键数,得出「本分钟是否活跃」;活跃时取活动窗口标题/进程名。

use device_query::{DeviceQuery, DeviceState};

/// 单分钟活动采样结果。
#[derive(Debug, Clone, Default)]
pub struct ActivitySample {
    pub is_active: bool,
    pub process_name: Option<String>,
    pub window_title: Option<String>,
}

/// 活动采样器抽象(不加 Send bound:真实采样器持有非 Send 的 DeviceState,仅在采样线程内使用)。
pub trait ActivitySampler {
    fn sample(&mut self) -> ActivitySample;
}

/// mock 采样器(测试用):按预设序列循环返回,越界回退 false。
pub struct MockSampler {
    pub seq: Vec<bool>,
    pub idx: usize,
}
impl MockSampler {
    pub fn new(seq: Vec<bool>) -> Self { Self { seq, idx: 0 } }
}
impl ActivitySampler for MockSampler {
    fn sample(&mut self) -> ActivitySample {
        let active = self.seq.get(self.idx).copied().unwrap_or(false);
        self.idx += 1;
        ActivitySample { is_active: active, process_name: None, window_title: None }
    }
}

/// device_query 轮询采样器。维护上次坐标/按键数,比较得出活跃。
pub struct DeviceQuerySampler {
    last_mouse: Option<(i64, i64)>,
    last_key_count: usize,
    state: DeviceState,
}
impl DeviceQuerySampler {
    pub fn new() -> Self { Self { last_mouse: None, last_key_count: 0, state: DeviceState::new() } }
}
impl ActivitySampler for DeviceQuerySampler {
    fn sample(&mut self) -> ActivitySample {
        let mouse = self.state.get_mouse();
        let keys = self.state.get_keys();
        let coords = (mouse.coords.0 as i64, mouse.coords.1 as i64);  // coords 类型以 device_query 文档为准,as i64 兼容
        let moved = self.last_mouse.map_or(true, |(x, y)| coords.0 != x || coords.1 != y);
        let key_count = keys.len();
        let key_activity = key_count > 0 || key_count != self.last_key_count;
        self.last_mouse = Some(coords);
        self.last_key_count = key_count;
        let is_active = moved || key_activity;
        let (process_name, window_title) = if is_active { active_window_info() } else { (None, None) };
        ActivitySample { is_active, process_name, window_title }
    }
}

/// 取当前活动窗口进程名/标题(active-win-pos-rs)。失败返回 (None,None),不阻断采样。
fn active_window_info() -> (Option<String>, Option<String>) {
    match active_win_pos_rs::active_window() {
        Ok(w) => (Some(w.app_name), Some(w.title)),
        Err(_) => (None, None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mock_sampler_cycles_sequence() {
        let mut m = MockSampler::new(vec![true, false, true]);
        assert!(m.sample().is_active);
        assert!(!m.sample().is_active);
        assert!(m.sample().is_active);
        assert!(!m.sample().is_active); // 越界回退
    }
}
```

- [ ] **Step 2: 注册子模块**

在 `src-tauri/src/health/mod.rs` 的 `pub mod state;` 后加:

```rust
pub mod monitor;
```

- [ ] **Step 3: 编译 + 测试 + 确认 device_query API**

Run: `cd src-tauri && cargo test health::monitor -- --nocapture`
> 若 `mouse.coords` / `get_keys()` / `active_win_pos_rs::active_window` 签名与文档不符,**用 context7 或 docs.rs/device_query、docs.rs/active-win-pos-rs 核对**后修正(比较逻辑不变)。Expected: mock 测试 PASS,真实实现编译通过。

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/health/monitor.rs src-tauri/src/health/mod.rs
git commit -m "feat(health): 键鼠采样 trait + device_query 跨平台实现 + mock"
```

---

### Task 5: 免打扰时段判定 reminder.rs(纯逻辑 TDD)

**Files:**
- Create: `src-tauri/src/health/reminder.rs`
- Modify: `src-tauri/src/health/mod.rs`(加 `pub mod reminder;`)

**Interfaces:**
- Produces: `is_in_dnd(now_ts, dnd_start, dnd_end) -> bool`(供 Task 6 daemon 调用)

- [ ] **Step 1: 写失败测试**

创建 `src-tauri/src/health/reminder.rs`:

```rust
//! 提醒辅助逻辑:免打扰时段判定(纯函数,可单测)。
//! 免打扰支持跨午夜:dnd_start=22:00, dnd_end=07:00 表示 22:00~次日 07:00 静默。

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn no_dnd_when_missing_bounds() {
        assert!(!is_in_dnd(43200, None, None));           // 12:00 UTC,无 dnd
        assert!(!is_in_dnd(43200, Some("09:00"), None));  // 缺一端
    }
    #[test]
    fn normal_range_inclusive_start_exclusive_end() {
        assert!(is_in_dnd(43200, Some("09:00"), Some("17:00")));   // 12:00 in
        assert!(!is_in_dnd(28800, Some("09:00"), Some("17:00")));  // 08:00 out
        assert!(!is_in_dnd(61200, Some("09:00"), Some("17:00")));  // 17:00 out(不含)
    }
    #[test]
    fn overnight_range() {
        assert!(is_in_dnd(79200, Some("22:00"), Some("07:00")));   // 22:00 in
        assert!(is_in_dnd(10800, Some("22:00"), Some("07:00")));   // 03:00 in
        assert!(!is_in_dnd(36000, Some("22:00"), Some("07:00")));  // 10:00 out
    }
    #[test]
    fn invalid_format_is_not_dnd() {
        assert!(!is_in_dnd(43200, Some("bad"), Some("17:00")));
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src-tauri && cargo test health::reminder`
Expected: 编译失败(`is_in_dnd` 未定义)。

- [ ] **Step 3: 实现**

在 `src-tauri/src/health/reminder.rs` 测试模块之前加:

```rust
use chrono::{NaiveTime, Timelike};

/// 判断 now_ts 的 UTC 时分是否落在免打扰区间 [start, end)。
///
/// - start/end 为 "HH:MM";任一 None 或解析失败 → false。
/// - 跨午夜(start>end):区间为 [start,24:00) ∪ [00:00,end)。
/// - 注:用 UTC 时分近似(单人单机可接受);如需精确当地时区后续引入 chrono-tz。
pub fn is_in_dnd(now_ts: i64, dnd_start: Option<&str>, dnd_end: Option<&str>) -> bool {
    let (Some(s), Some(e)) = (dnd_start, dnd_end) else { return false; };
    let (Ok(start), Ok(end)) = (NaiveTime::parse_from_str(s, "%H:%M"), NaiveTime::parse_from_str(e, "%H:%M"))
        else { return false; };
    let secs_of_day = now_ts.rem_euclid(86400) as u32;
    let now_mins = secs_of_day / 60;
    let start_mins = start.hour() * 60 + start.minute();
    let end_mins = end.hour() * 60 + end.minute();
    if start_mins <= end_mins {
        now_mins >= start_mins && now_mins < end_mins
    } else {
        now_mins >= start_mins || now_mins < end_mins
    }
}
```

- [ ] **Step 4: 注册子模块 + 测试通过**

在 `src-tauri/src/health/mod.rs` 加 `pub mod reminder;`
Run: `cd src-tauri && cargo test health::reminder -- --nocapture`
Expected: 4 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/health/reminder.rs src-tauri/src/health/mod.rs
git commit -m "feat(health): 免打扰时段判定(支持跨午夜,纯逻辑 TDD)"
```

---

### Task 6: 后台 daemon(HealthRuntime + start_health_daemon)

**Files:**
- Modify: `src-tauri/src/health/mod.rs`(加 HealthRuntime + start_health_daemon + handle_sample)
- Consumes: Task 2 `HealthRepo`、Task 3 `HealthStateMachine`、Task 4 `DeviceQuerySampler`、Task 5 `is_in_dnd`

**Interfaces:**
- Produces: `HealthRuntime`(供 Task 7 挂 AppState)、`start_health_daemon(app, state) -> CancellationToken`

> **架构**:采样放 `std::thread`(持有非 Send 的 `DeviceState`,线程局部),通过 tokio mpsc 把 `ActivitySample`(Send)发给 tokio 处理 task(写库 + 状态机 + emit)。复用 `cc/collector.rs` 的 `select!{cancel, recv}` 范式。

- [ ] **Step 1: 替换 mod.rs 全部内容**

将 `src-tauri/src/health/mod.rs` 替换为:

```rust
//! 健康提醒模块:键鼠监测 + 工作/休息状态机 + 提醒触发。
pub mod monitor;
pub mod reminder;
pub mod state;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use chrono::Utc;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::error::AppError;
use crate::state::AppState;

use self::monitor::{ActivitySample, DeviceQuerySampler};
use self::reminder::is_in_dnd;
use self::state::{HealthStateMachine, HealthThresholds};

/// 健康监测运行时共享状态(跨 daemon task 与命令层)。
pub struct HealthRuntime {
    pub machine: Mutex<HealthStateMachine>,
    pub snooze_until: Mutex<Option<i64>>,
    pub paused: AtomicBool,
}
impl HealthRuntime {
    pub fn new() -> Self {
        Self {
            machine: Mutex::new(HealthStateMachine::new()),
            snooze_until: Mutex::new(None),
            paused: AtomicBool::new(false),
        }
    }
}

/// 启动健康监测后台。返回 CancellationToken,供 RunEvent::Exit 取消。
///
/// 一个 std::thread 采样(持有非 Send 的 DeviceState)+ 一个 tokio task 处理。
pub fn start_health_daemon(app: AppHandle, state: std::sync::Arc<AppState>) -> CancellationToken {
    let cancel = CancellationToken::new();
    let (tx, mut rx) = mpsc::channel::<ActivitySample>(8);

    // 采样线程(线程局部持有 sampler,无需 Send)
    let cancel_s = cancel.clone();
    std::thread::spawn(move || {
        let mut sampler = DeviceQuerySampler::new();
        loop {
            if cancel_s.is_cancelled() { break; }
            let sample = sampler.sample();
            if tx.blocking_send(sample).is_err() { break; }
            std::thread::sleep(Duration::from_secs(60));
        }
    });

    // 处理 task
    let app_h = app.clone();
    let state_h = state.clone();
    let cancel_h = cancel.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = cancel_h.cancelled() => break,
                Some(sample) = rx.recv() => {
                    if let Err(e) = handle_sample(&app_h, &state_h, sample).await {
                        tracing::warn!("健康采样处理失败: {e}");
                    }
                }
            }
        }
    });
    cancel
}

/// 处理一次采样:写库 → 推进状态机 → 满足条件 emit health:reminder。
async fn handle_sample(app: &AppHandle, state: &AppState, sample: ActivitySample) -> Result<(), AppError> {
    let cfg = state.config.read().unwrap().health.clone();
    let now = Utc::now().timestamp();
    let minute_ts = now - now.rem_euclid(60);
    let active_for_reminder = cfg.enabled && !state.health.paused.load(Ordering::Relaxed);

    // 写活动记录(record_window_title=false 时不记标题)
    let rec = crate::storage::health_repo::ActivityRecord {
        ts: minute_ts,
        is_active: sample.is_active,
        process_name: sample.process_name.clone(),
        window_title: if cfg.record_window_title { sample.window_title.clone() } else { None },
    };
    state.health_repo.insert_activity(&rec).await?;

    if !active_for_reminder { return Ok(()); }

    // 推进状态机
    let thresholds = HealthThresholds { work_window_seconds: cfg.work_window_seconds, break_seconds: cfg.break_seconds };
    let should_remind = {
        let mut m = state.health.machine.lock().unwrap();
        m.advance(sample.is_active, now, &thresholds).should_remind
    };

    if should_remind {
        let snoozed = state.health.snooze_until.lock().unwrap().map_or(false, |t| t > now);
        let dnd = is_in_dnd(now, cfg.dnd_start.as_deref(), cfg.dnd_end.as_deref());
        if !snoozed && !dnd && cfg.notify_enabled {
            // 仅 emit;系统通知由前端监听后发出(文案走 i18n)
            let _ = app.emit("health:reminder", serde_json::json!({ "workWindowSeconds": cfg.work_window_seconds }));
        }
    }

    // 数据清理(DELETE 幂等,成本低;可优化为跨天清理)
    let cutoff = now - cfg.retain_days * 86400;
    if let Err(e) = state.health_repo.cleanup_older_than(cutoff).await {
        tracing::warn!("活动记录清理失败: {e}");
    }
    Ok(())
}
```

- [ ] **Step 2: 编译(此时 AppState.health/health_repo 字段尚未加,预期编译报错,留待 Task 7 补全)**

Run: `cd src-tauri && cargo build 2>&1 | head -30`
Expected: 报 `AppState` 无 `health` / `health_repo` 字段 —— 这是预期的,Task 7 补全。

- [ ] **Step 3: Commit(允许暂不通过编译,Task 7 收尾)**

```bash
git add src-tauri/src/health/mod.rs
git commit -m "feat(health): 后台 daemon(采样线程+处理 task+状态机推进+emit,Task7 接入 AppState 后编译通过)"
```

---

### Task 7: AppState 字段 + lib.rs 接入 + commands/health.rs

**Files:**
- Modify: `src-tauri/src/state.rs`(AppState 加 3 字段)
- Modify: `src-tauri/src/lib.rs`(plugin 注册 + setup 初始化 + invoke_handler + RunEvent::Exit)
- Modify: `src-tauri/src/commands/mod.rs`(`pub mod health`)
- Create: `src-tauri/src/commands/health.rs`

**Interfaces:**
- Consumes: Task 1 `HealthConfig`、Task 2 `HealthRepo`、Task 6 `HealthRuntime`/`start_health_daemon`
- Produces: AppState.health/health_repo/health_cancel;命令 `get_health_status`/`toggle_health_enabled`/`toggle_health_paused`/`snooze_reminder`/`skip_reminder`/`update_health_config`/`get_activity_stats`

- [ ] **Step 1: AppState 加字段**

在 `src-tauri/src/state.rs` 的 `AppState` struct 内(`update_cancel_token` 字段之后)加:

```rust
    pub health: std::sync::Arc<crate::health::HealthRuntime>,
    pub health_repo: std::sync::Arc<crate::storage::health_repo::HealthRepo>,
    pub health_cancel: std::sync::Arc<std::sync::Mutex<Option<tokio_util::sync::CancellationToken>>>,
```

- [ ] **Step 2: 写 commands/health.rs 完整实现**

创建 `src-tauri/src/commands/health.rs`:

```rust
//! 健康提醒命令层:状态查询 / 开关 / 推迟 / 跳过 / 配置 / 统计。

use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use tauri::State;

use crate::config::HealthConfig;
use crate::error::AppError;
use crate::health::state::MachineState;
use crate::state::AppState;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HealthConfigDto {
    pub enabled: bool,
    pub work_window_seconds: i64,
    pub break_seconds: i64,
    pub record_window_title: bool,
    pub retain_days: i64,
    pub notify_enabled: bool,
    pub dnd_start: Option<String>,
    pub dnd_end: Option<String>,
}
impl From<HealthConfig> for HealthConfigDto {
    fn from(h: HealthConfig) -> Self {
        Self {
            enabled: h.enabled, work_window_seconds: h.work_window_seconds, break_seconds: h.break_seconds,
            record_window_title: h.record_window_title, retain_days: h.retain_days, notify_enabled: h.notify_enabled,
            dnd_start: h.dnd_start, dnd_end: h.dnd_end,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatusDto {
    pub enabled: bool,
    pub paused: bool,
    pub phase: String,
    pub window_start_ts: Option<i64>,
    pub work_window_seconds: i64,
    pub break_seconds: i64,
    pub snooze_until: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityStatsDto {
    pub active_minutes: i64,
    pub idle_minutes: i64,
}

#[tauri::command]
pub async fn get_health_status(state: State<'_, AppState>) -> Result<HealthStatusDto, AppError> {
    let cfg = state.config.read().unwrap().health.clone();
    let (phase, window_start_ts) = {
        let m = state.health.machine.lock().unwrap();
        match &m.state {
            MachineState::Idle => ("idle".to_string(), None),
            MachineState::Working(w) => ("working".to_string(), Some(w.window_start_ts)),
            MachineState::Resting { .. } => ("resting".to_string(), None),
        }
    };
    Ok(HealthStatusDto {
        enabled: cfg.enabled,
        paused: state.health.paused.load(Ordering::Relaxed),
        phase,
        window_start_ts,
        work_window_seconds: cfg.work_window_seconds,
        break_seconds: cfg.break_seconds,
        snooze_until: *state.health.snooze_until.lock().unwrap(),
    })
}

#[tauri::command]
pub async fn toggle_health_enabled(state: State<'_, AppState>, enabled: bool) -> Result<HealthConfigDto, AppError> {
    {
        let mut cfg = state.config.write().unwrap();
        cfg.health.enabled = enabled;
        cfg.save()?;
    }
    Ok(state.config.read().unwrap().health.clone().into())
}

#[tauri::command]
pub async fn toggle_health_paused(state: State<'_, AppState>, paused: bool) -> Result<(), AppError> {
    state.health.paused.store(paused, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn snooze_reminder(state: State<'_, AppState>, minutes: i64) -> Result<(), AppError> {
    let now = chrono::Utc::now().timestamp();
    *state.health.snooze_until.lock().unwrap() = Some(now + minutes * 60);
    Ok(())
}

#[tauri::command]
pub async fn skip_reminder(state: State<'_, AppState>) -> Result<(), AppError> {
    // 跳过:重置状态机(结束当前工作窗口)
    *state.health.machine.lock().unwrap() = crate::health::state::HealthStateMachine::new();
    *state.health.snooze_until.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub async fn update_health_config(state: State<'_, AppState>, config: HealthConfigDto) -> Result<HealthConfigDto, AppError> {
    {
        let mut cfg = state.config.write().unwrap();
        cfg.health.enabled = config.enabled;
        cfg.health.work_window_seconds = config.work_window_seconds;
        cfg.health.break_seconds = config.break_seconds;
        cfg.health.record_window_title = config.record_window_title;
        cfg.health.retain_days = config.retain_days;
        cfg.health.notify_enabled = config.notify_enabled;
        cfg.health.dnd_start = config.dnd_start.clone();
        cfg.health.dnd_end = config.dnd_end.clone();
        cfg.save()?;
    }
    Ok(state.config.read().unwrap().health.clone().into())
}

#[tauri::command]
pub async fn get_activity_stats(state: State<'_, AppState>, since_ts: i64) -> Result<ActivityStatsDto, AppError> {
    let (active, idle) = state.health_repo.aggregate_minutes(since_ts).await?;
    Ok(ActivityStatsDto { active_minutes: active, idle_minutes: idle })
}
```

- [ ] **Step 3: commands/mod.rs 注册**

在 `src-tauri/src/commands/mod.rs` 加 `pub mod health;`(参照现有 `pub mod prompts;`)。

- [ ] **Step 4: lib.rs 接入 —— plugin 注册**

在 `src-tauri/src/lib.rs` Builder 链 `.plugin(tauri_plugin_process::init())` 之后加:

```rust
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,
    ))
```

- [ ] **Step 5: lib.rs 接入 —— setup 初始化**

在 `src-tauri/src/lib.rs` setup 闭包内:
(a) 在构造各 repo 处(`Arc::new(XxxRepo::new(pool.clone()))` 附近)加:

```rust
        let health_repo = std::sync::Arc::new(crate::storage::health_repo::HealthRepo::new(pool.clone()));
        let health = std::sync::Arc::new(crate::health::HealthRuntime::new());
        let health_cancel = std::sync::Arc::new(std::sync::Mutex::new(None::<tokio_util::sync::CancellationToken>));
```

(b) 在 `AppState { ... }` 构造的字段列表末尾加:

```rust
            health,
            health_repo,
            health_cancel,
```

(c) 在 `app.manage(state)` **之后**、tray/hotkey 注册附近加(启动 daemon):

```rust
        let state_for_daemon: tauri::State<'_, AppState> = app.state();
        let cancel = crate::health::start_health_daemon(app.handle().clone(), state_for_daemon.inner().clone());
        *state_for_daemon.health_cancel.lock().unwrap() = Some(cancel);
```

- [ ] **Step 6: lib.rs 接入 —— invoke_handler 注册**

在 `src-tauri/src/lib.rs` 顶部 `use crate::commands::{...}` 别名列表加 `health as health_cmd`。在 `generate_handler![...]` 列表末尾(`install_update,` 之后)加:

```rust
        health_cmd::get_health_status,
        health_cmd::toggle_health_enabled,
        health_cmd::toggle_health_paused,
        health_cmd::snooze_reminder,
        health_cmd::skip_reminder,
        health_cmd::update_health_config,
        health_cmd::get_activity_stats,
```

- [ ] **Step 7: lib.rs 接入 —— RunEvent::Exit 取消 daemon**

在 `lib.rs` `.run(|app_handle, event| {...})` 的 `RunEvent::Exit` 分支内,现有 CC 采集器取消之后加:

```rust
        if let Some(t) = state.health_cancel.lock().unwrap().take() {
            t.cancel();
            tracing::info!("健康监测 daemon 已停止");
        }
```

- [ ] **Step 8: 编译 + 全量测试**

Run: `cd src-tauri && cargo build && cargo test && cargo clippy -- -D warnings 2>&1 | grep -E "health|error" | head`
Expected: 编译通过;health 相关测试全 PASS;clippy 无 health 相关 warning。
> 若 `tauri_plugin_autostart::init` 签名不符,用 context7/docs.rs 核对 `tauri-plugin-autostart` v2 API。

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/state.rs src-tauri/src/lib.rs src-tauri/src/commands/health.rs src-tauri/src/commands/mod.rs src-tauri/Cargo.lock
git commit -m "feat(health): AppState/lib 接入 + 7 个 health 命令(notification/autostart 插件注册,闭环编译通过)"
```

### Task 8: accessibility 权限 + 开机自启启用 + 托盘菜单

**Files:**
- Modify: `src-tauri/src/permissions/mod.rs`(加 accessibility)
- Modify: `src-tauri/src/lib.rs`(setup 启用自启)
- Modify: `src-tauri/src/tray.rs`(暂停/恢复菜单项)

**Interfaces:**
- Produces: `check_accessibility_access()`、`PermissionsStatus.accessibility`;托盘「暂停/恢复监测」;setup 按 config 同步自启

- [ ] **Step 1: permissions/mod.rs 加 accessibility 检测**

在 `src-tauri/src/permissions/mod.rs` 现有 FFI extern 区加(macOS):

```rust
#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}
```
> 注:此处与现有 CG*(不写 `#[link]`)不同——AX* 符号在 ApplicationServices/HIServices 子框架,未必被 Tauri 依赖链带入,故显式 link。若编译显示 framework 已链接的 warning,可移除 `#[link]`。

在现有 `check_input_monitoring_access` 附近加(两份 cfg):

```rust
#[cfg(target_os = "macos")]
pub fn check_accessibility_access() -> bool {
    unsafe { AXIsProcessTrusted() }
}

#[cfg(not(target_os = "macos"))]
pub fn check_accessibility_access() -> bool { true }
```

- [ ] **Step 2: PermissionsStatus 加 accessibility + check_permissions 填充**

在 `permissions/mod.rs` 的 `PermissionsStatus` struct 加字段:

```rust
    pub accessibility: PermissionState,
```

在 `check_permissions()` 内构造 `PermissionsStatus` 时加:

```rust
        accessibility: PermissionState { granted: check_accessibility_access() },
```

- [ ] **Step 3: request_permission / open_permission_settings 加 accessibility 分支**

在 `request_permission` 的 macOS `match perm_type` 中加(与 inputMonitoring 同级):

```rust
        "accessibility" => {
            // 无系统 request API,只能 open 设置面板引导
            if open_settings.unwrap_or(true) {
                opened = open_permission_settings("accessibility");
            }
        }
```

在 `open_permission_settings` 的 match 中加分支(打开「系统设置 > 隐私与安全 > 辅助功能」):

```rust
        "accessibility" => {
            // 打开辅助功能面板
            std::process::Command::new("open")
                .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
                .spawn().is_ok()
        }
```
> 若现有 `open_permission_settings` 实现不同(如已用统一 URL 拼接),按其风格加入 accessibility 对应 URL。

- [ ] **Step 4: lib.rs setup 启用开机自启**

在 `src-tauri/src/lib.rs` setup 闭包内,daemon 启动附近加(按 config.health.enabled 同步自启):

```rust
        use tauri_plugin_autostart::ManagerExt;
        let autostart = app.autolaunch();
        let want_autostart = state_for_daemon.config.read().unwrap().health.enabled;
        if want_autostart { let _ = autostart.enable(); } else { let _ = autostart.disable(); }
        tracing::info!("开机自启: {}", if want_autostart { "已启用" } else { "已禁用" });
```
> 简单实现:每次启动按 `health.enabled` 同步自启。若需尊重用户手动改动,后续加 `health.autostart_registered` 标志。

- [ ] **Step 5: tray.rs 加「暂停/恢复监测」菜单项**

在 `src-tauri/src/tray.rs`:
(a) 加常量 `const MENU_PAUSE: &str = "tray_pause";`
(b) 在 `build_tray` 内 `MenuItem::with_id` 系列加:
```rust
    let pause_item = MenuItem::with_id(app, MENU_PAUSE, "暂停/恢复监测", true, None::<&str>)?;
```
(c) 把 `pause_item` 加入 `Menu::with_items` 数组(放在 `shot_item` 与 `quit_item` 之间)。
(d) 在 `on_menu_event` 的 match 加:
```rust
            MENU_PAUSE => {
                use std::sync::atomic::Ordering;
                let state: tauri::State<crate::state::AppState> = app.state();
                let cur = state.health.paused.load(Ordering::Relaxed);
                state.health.paused.store(!cur, Ordering::Relaxed);
                tracing::info!("健康监测 {}", if !cur { "已暂停" } else { "已恢复" });
            }
```

- [ ] **Step 6: 编译测试**

Run: `cd src-tauri && cargo build && cargo clippy -- -D warnings 2>&1 | grep -E "health|permission|tray|error" | head`
Expected: 编译通过,无 health/permission/tray 相关 warning。

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/permissions/mod.rs src-tauri/src/lib.rs src-tauri/src/tray.rs
git commit -m "feat(health): accessibility 权限检测+引导 / 开机自启启用 / 托盘暂停恢复菜单"
```

---

### Task 9: 前端 api + types + Health 页 + 路由/导航/i18n + 系统通知监听

**Files:**
- Modify: `web/package.json`(加 `@tauri-apps/plugin-notification`)
- Create: `web/src/api/health.ts`
- Modify: `web/src/lib/types.ts`
- Create: `web/src/pages/Health/index.tsx`
- Modify: `web/src/App.tsx`(路由 + HealthReminderListener)
- Modify: `web/src/components/layout/AppShell/AppShell.tsx`(NavItem)
- Modify: `web/src/lib/icons` 对应文件(HealthIcon)
- Create: `web/src/i18n/locales/en/health.json` / `zh/health.json`
- Modify: `web/src/i18n/index.ts`(注册 health)+ `locales/{en,zh}/nav.json`(health key)
- Modify: `src-tauri/capabilities/default.json`(`notification:default`)

**Interfaces:**
- Consumes: Task 7 全部命令
- Produces: `/health` 页签可用(状态 + 开关 + 设置 + 基础统计);`health:reminder` 触发系统通知

- [ ] **Step 1: 加前端依赖**

```bash
cd web && npm install @tauri-apps/plugin-notification@^2
```

- [ ] **Step 2: capabilities 加 notification 权限**

`src-tauri/capabilities/default.json` 的 `permissions` 数组加 `"notification:default"`。

- [ ] **Step 3: api/health.ts**

创建 `web/src/api/health.ts`:

```ts
import { invoke } from './client';
import type { HealthConfig, HealthStatus, ActivityStats } from '@/lib/types';

export const healthApi = {
  getStatus: () => invoke<HealthStatus>('get_health_status'),
  toggleEnabled: (enabled: boolean) => invoke<HealthConfig>('toggle_health_enabled', { enabled }),
  togglePaused: (paused: boolean) => invoke<void>('toggle_health_paused', { paused }),
  snooze: (minutes: number) => invoke<void>('snooze_reminder', { minutes }),
  skip: () => invoke<void>('skip_reminder'),
  updateConfig: (config: HealthConfig) => invoke<HealthConfig>('update_health_config', { config }),
  getStats: (sinceTs: number) => invoke<ActivityStats>('get_activity_stats', { sinceTs }),
};
```

- [ ] **Step 4: types.ts 加类型**

在 `web/src/lib/types.ts` 加:

```ts
export interface HealthConfig {
  enabled: boolean;
  workWindowSeconds: number;
  breakSeconds: number;
  recordWindowTitle: boolean;
  retainDays: number;
  notifyEnabled: boolean;
  dndStart: string | null;
  dndEnd: string | null;
}
export interface HealthStatus {
  enabled: boolean;
  paused: boolean;
  phase: 'idle' | 'working' | 'resting';
  windowStartTs: number | null;
  workWindowSeconds: number;
  breakSeconds: number;
  snoozeUntil: number | null;
}
export interface ActivityStats {
  activeMinutes: number;
  idleMinutes: number;
}
```
并把现有 `PermissionsStatus` 加 `accessibility: { granted: boolean };`。

- [ ] **Step 5: i18n —— health namespace + nav key + 注册**

创建 `web/src/i18n/locales/zh/health.json`:

```json
{
  "title": "健康提醒",
  "status": { "idle": "空闲", "working": "工作中", "resting": "休息中" },
  "enableMonitoring": "开启久坐监测",
  "pause": "暂停监测",
  "resume": "恢复监测",
  "workWindowMinutes": "工作窗口(分钟)",
  "breakMinutes": "休息判定(分钟)",
  "notifyEnabled": "系统通知提醒",
  "recordWindowTitle": "记录窗口标题(统计用)",
  "dndStart": "免打扰开始",
  "dndEnd": "免打扰结束",
  "todayStats": "今日统计",
  "activeMinutes": "活跃 {{n}} 分钟",
  "idleMinutes": "休息 {{n}} 分钟",
  "reminderTitle": "该起来活动一下啦 🌿",
  "reminderBody": "连续工作已久,站起来走走、伸展一下吧。",
  "snoozed": "已推迟提醒",
  "skipped": "已跳过本次提醒"
}
```
创建 `web/src/i18n/locales/en/health.json`(同结构英文)。在 `locales/{en,zh}/nav.json` 加 `"health": "健康提醒"`(en: `"Health"`)。在 `i18n/index.ts` 的 resources 注册 `health: health_zh` / `health: health_en`(参照现有 namespace import + 注册)。

- [ ] **Step 6: Health 页**

创建 `web/src/pages/Health/index.tsx`(hooks 在 early return 之前——规则 20):

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { healthApi } from '@/api/health';
import type { ActivityStats, HealthConfig, HealthStatus } from '@/lib/types';

export default function Health() {
  const { t } = useTranslation(['health', 'common']);
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [config, setConfig] = useState<HealthConfig | null>(null);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [s, c] = await Promise.all([healthApi.getStatus(), healthApi.getStatus()]); // status 拿配置项;配置用 update 往返
    // 简化:从 status 取配置相关字段构造本地 config 视图
    setStatus(s);
    const startOfDay = Math.floor(Date.now() / 1000) - (Math.floor(Date.now() / 1000) % 86400);
    setStats(await healthApi.getStats(startOfDay));
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); const id = setInterval(refresh, 30000); return () => clearInterval(id); }, [refresh]);

  if (loading || !status) return <div>{t('common:loading')}</div>;

  const toggleEnabled = async () => {
    const next = !status.enabled;
    setStatus({ ...status, enabled: next });
    await healthApi.toggleEnabled(next);
  };
  const togglePaused = async () => {
    const next = !status.paused;
    setStatus({ ...status, paused: next });
    await healthApi.togglePaused(next);
  };

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1>{t('health:title')}</h1>
      <section>
        <strong>{t('health:status.' + status.phase)}</strong>
        <label style={{ marginLeft: 16 }}>
          <input type="checkbox" checked={status.enabled} onChange={toggleEnabled} />
          {t('health:enableMonitoring')}
        </label>
        <button onClick={togglePaused} style={{ marginLeft: 16 }} disabled={!status.enabled}>
          {status.paused ? t('health:resume') : t('health:pause')}
        </button>
      </section>
      <section>
        <h3>{t('health:todayStats')}</h3>
        {stats && (
          <ul>
            <li>{t('health:activeMinutes', { n: stats.activeMinutes })}</li>
            <li>{t('health:idleMinutes', { n: stats.idleMinutes })}</li>
          </ul>
        )}
      </section>
      {/* 工作窗口/休息/通知/记录标题/免打扰 配置项:Plan 2 完善为完整表单,Plan 1 先留状态展示 */}
    </div>
  );
}
```
> Plan 1 Health 页聚焦「状态 + 开关 + 暂停 + 基础统计」;完整配置表单(工作窗口/休息/免打扰/记录标题)在 Plan 2 补全为受控表单(调 `updateConfig`)。本步确保闭环可用 + i18n 走通。

- [ ] **Step 7: App.tsx 加路由 + HealthReminderListener**

在 `web/src/App.tsx`:
(a) import:`import Health from './pages/Health';` 与 `import { sendNotification } from '@tauri-apps/plugin-notification';`
(b) 在 AppShell 内层 Route(与 `<Route path="/settings" ...>` 同级)加:`<Route path="/health" element={<Health />} />`
(c) 加顶层监听组件(与 `PermissionNeededListener` 同级):

```tsx
function HealthReminderListener() {
  const { t } = useTranslation(['health', 'common']);
  useEffect(() => {
    const unlisten = listen('health:reminder', () => {
      void sendNotification({ title: t('health:reminderTitle'), body: t('health:reminderBody') });
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, [t]);
  return null;
}
```
在 `App` 的 `<>` 内 `<PermissionNeededListener />` 旁加 `<HealthReminderListener />`。

- [ ] **Step 8: AppShell 加导航项 + HealthIcon**

在 `web/src/lib/icons`(对应导出文件)加 `HealthIcon` 组件(参照现有 `HomeIcon` 等 SVG 写法)。
在 `AppShell.tsx` 的 `<nav>` 内(与 `<NavItem to="/settings" ...>` 同级)加:

```tsx
<NavItem to="/health" label={t('nav:health')} icon={<HealthIcon />} />
```

- [ ] **Step 9: 类型检查 + lint**

Run: `cd web && npx tsc --noEmit && npm run lint`
Expected: 类型通过,lint 通过(新增 health 文案 key 编译期校验)。

- [ ] **Step 10: Commit**

```bash
git add web/package.json web/package-lock.json web/src/api/health.ts web/src/lib/types.ts \
  web/src/pages/Health web/src/App.tsx web/src/components web/src/lib/icons web/src/i18n \
  src-tauri/capabilities/default.json
git commit -m "feat(health): 前端 Health 页签 + api/types/i18n + health:reminder 系统通知监听"
```

---

### Task 10: 文档更新 + 全量验证

**Files:**
- Modify: `src-tauri/CLAUDE.md`(加 M10 健康模块节)
- Modify: `web/CLAUDE.md`(Health 页 + i18n namespace)
- Modify: `docs/prd.md`(补健康提醒功能)

- [ ] **Step 1: 更新 src-tauri/CLAUDE.md**

在 M9 节之后加「M10 健康提醒模块」节,记录:health/ 子模块(monitor/state/reminder/mod)、HealthRepo、后台 daemon(采样线程 + 处理 task)、HealthConfig(config.json,serde default 兼容)、accessibility 权限、tauri-plugin-autostart/notification、7 个 health 命令、托盘暂停菜单、emit `health:reminder`。

- [ ] **Step 2: 更新 web/CLAUDE.md**

加 Health 页条目(路由 `/health`、`healthApi`、i18n namespace `health`、HealthReminderListener 监听 `health:reminder` 发系统通知)。

- [ ] **Step 3: 更新 docs/prd.md**

在功能列表补「健康提醒(久坐监测 + 工作/休息状态机 + 系统通知 + 基础统计)」条目(规则 10)。

- [ ] **Step 4: 全量构建 + 测试**

Run:
```bash
cd src-tauri && cargo build && cargo test && cargo clippy -- -D warnings 2>&1 | tail -5
cd ../web && npx tsc --noEmit && npm run lint && npm run build
```
Expected: 全绿。

- [ ] **Step 5: 手动验证(规则 11/12,需人工)**

`./start.sh` dev 启动后验证:
1. 首次启动引导 macOS Accessibility 授权(`PermissionStatusBadge` 显示 accessibility)→ 授权后监测自动开始
2. Health 页显示「空闲」→ 键鼠活动后变「工作中」,工作窗口计时
3. 临时把工作窗口调小(如 1 分钟)实测:连续活动满窗口且无 5 分钟休息 → 收到系统通知(中文标题/正文)
4. 「暂停监测」→ 不再提醒;「恢复」→ 恢复
5. 托盘「暂停/恢复监测」切换生效
6. 免打扰时段(临时设当前时间)→ 不弹通知
7. 开机自启:注销重登或查看 `~/Library/LaunchAgents` 有注册项
8. 主动读 `tracing` 日志确认采样/状态机/清理行为(规则 12)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/CLAUDE.md web/CLAUDE.md docs/prd.md
git commit -m "docs(health): 更新 CLAUDE.md/prd 记录健康提醒模块(Plan 1 核心闭环)"
```

---

## Self-Review(写计划后自查)

**1. Spec 覆盖**(对照 spec 各节):
- ✅ 后端模块(§1)→ Task 2/3/4/5/6/7
- ✅ 键鼠监测+权限(§2)→ Task 4 + Task 8(accessibility)
- ✅ 状态机(§3)→ Task 3
- ✅ 数据模型(§4)→ Task 1(HealthConfig)+ Task 2(表)
- ✅ 提醒机制(§5)→ Task 6 emit + Task 9 系统通知(Plan 1 仅系统通知;toast/全屏在 Plan 2)
- ✅ 前端页签(§6)→ Task 9(基础版,完整表单 Plan 2)
- ✅ 开机自启(§7)→ Task 8
- ⏸ 喝水提醒(§8)→ **Plan 2**(Plan 1 不含,water 表已建留接口)
- ⏸ toast/全屏遮罩/统计图表 → **Plan 2**
- ✅ 错误处理(§9)→ Task 6 容错(单次失败 warn 跳过)、Task 1 隐私开关 record_window_title
- ✅ 测试(§10)→ Task 1/2/3/5 TDD + Task 10 手动验证

**Plan 1 范围确认**:核心久坐闭环(监测→状态机→系统通知→前端状态页/开关/基础统计/自启/权限)。喝水、toast、全屏、图表、完整配置表单 → Plan 2。

**2. Placeholder 扫描**:无 TBD/TODO;device_query/autostart API 步骤均标注「以 docs.rs/context7 核对」+ 给出比较逻辑不变的结构(非空 placeholder)。

**3. 类型一致性**:`HealthConfig`(后端 snake_case config / `HealthConfigDto` camelCase)↔ 前端 `HealthConfig`(camelCase)字段对齐(enabled/workWindowSeconds/breakSeconds/recordWindowTitle/retainDays/notifyEnabled/dndStart/dndEnd);`HealthStatusDto` ↔ `HealthStatus`;`ActivityStatsDto` ↔ `ActivityStats`;命令名 `get_health_status` 等与 api/health.ts invoke 字符串一致;emit `health:reminder` 与前端 listen 一致。✅

---

## Execution Handoff

**Plan 1 完成并保存到 `docs/superpowers/plans/2026-06-22-health-reminder-core.md`。两种执行方式:**

**1. Subagent-Driven(推荐)** — 每个 task 派一个新 subagent 实现,task 间 review,快速迭代(规则 6/14:复杂任务用 git worktree 隔离开发)。

**2. Inline Execution** — 在当前会话按 executing-plans 批量执行 + checkpoint review。

**Plan 2(体验完善:toast + 全屏遮罩 + 喝水提醒 + 统计图表 + 完整配置表单)将在 Plan 1 闭环验证通过后编写。**

**选哪种执行方式?**
