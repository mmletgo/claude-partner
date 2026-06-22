//! storage/claude_md_repo.rs — CLAUDE.md 单条记录数据访问层
//!
//! Business Logic（为什么需要这个模块）:
//!     user 级 CLAUDE.md 跨设备同步需要在本地持久化一份"权威版本"，供同步引擎对账与
//!     落库。该表是单例表（id 恒为 "claude_md"），故只需 get/upsert 两个方法，
//!     对照 `PromptRepo` 的单条读写模式，JSON 字段（vector_clock）用 serde_json 序列化。
//!
//! Code Logic（这个模块做什么）:
//!     持有 `SqlitePool`，用运行期 `sqlx::query` 执行 SQL。
//!     vector_clock 用 serde_json 序列化为紧凑 JSON 读写，与既有同步协议互通。

use crate::error::AppError;
use crate::models::claude_md::{ClaudeMdRow, CLAUDE_MD_ID};
use sqlx::sqlite::SqlitePool;
use sqlx::Row;
use std::collections::HashMap;

/// CLAUDE.md 仓库，封装 claude_md 单例表的全部数据库操作。
pub struct ClaudeMdRepo {
    /// SQLite 连接池（max_connections(1)，单连接语义）
    db: SqlitePool,
}

impl ClaudeMdRepo {
    /// 构造仓库。
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    /// 读取 CLAUDE.md 单例记录（无行返回 None）。
    ///
    /// Business Logic: 启动时对账、同步时取本地版本均需先读出当前权威版本。
    /// Code Logic: `SELECT ... WHERE id = 'claude_md'`，vector_clock 用 serde_json 反序列化。
    pub async fn get(&self) -> Result<Option<ClaudeMdRow>, AppError> {
        let row = sqlx::query(
            "SELECT id, content, updated_at, device_id, vector_clock FROM claude_md WHERE id = ?",
        )
        .bind(CLAUDE_MD_ID)
        .fetch_optional(&self.db)
        .await?;
        match row {
            Some(r) => Ok(Some(Self::row_to_claude_md(&r)?)),
            None => Ok(None),
        }
    }

    /// 插入或覆盖 CLAUDE.md 单例记录（按 id 主键，INSERT OR REPLACE）。
    ///
    /// Business Logic: 任何来源的变更（本地编辑、文件对账、远端合并）最终都经此方法落库。
    /// Code Logic: vector_clock 用 serde_json 序列化为 JSON TEXT 写入。
    pub async fn upsert(&self, row: &ClaudeMdRow) -> Result<(), AppError> {
        let vc_text = serde_json::to_string(&row.vector_clock)?;
        sqlx::query(
            "INSERT OR REPLACE INTO claude_md (id, content, updated_at, device_id, vector_clock) \
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&row.id)
        .bind(&row.content)
        .bind(&row.updated_at)
        .bind(&row.device_id)
        .bind(vc_text)
        .execute(&self.db)
        .await?;
        Ok(())
    }

    /// 将数据库一行映射为 ClaudeMdRow（vector_clock JSON 反序列化）。
    fn row_to_claude_md(row: &sqlx::sqlite::SqliteRow) -> Result<ClaudeMdRow, AppError> {
        let vc_text: String = row.try_get("vector_clock")?;
        let vector_clock: HashMap<String, u64> = serde_json::from_str(&vc_text)?;
        Ok(ClaudeMdRow {
            id: row.try_get("id")?,
            content: row.try_get("content")?,
            updated_at: row.try_get("updated_at")?,
            device_id: row.try_get("device_id")?,
            vector_clock,
        })
    }
}
