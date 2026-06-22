//! models/claude_md.rs — 用户级 CLAUDE.md 数据模型
//!
//! Business Logic（为什么需要这个模块）:
//!     user 级 CLAUDE.md（~/.claude/CLAUDE.md）需要跨设备同步，使其成为单一的
//!     全局记忆载体。与 Prompt 一样，需要同时服务两个场景：
//!     1) 数据库读写与 P2P 同步（snake_case，与既有同步协议互通）；
//!     2) 前端 IPC 返回（camelCase，对齐前端 TypeScript 类型）。
//!     全表只有一行（id 恒为 "claude_md"），是"单例记录"。
//!
//! Code Logic（这个模块做什么）:
//!     - `ClaudeMdRow`：snake_case，直接映射 claude_md 表一行，content 为正文文本，
//!       vector_clock 为 HashMap<String,u64>，updated_at 用 String 透传。
//!     - `ClaudeMdDto`：camelCase，比 Row 少 id（前端不需要知道固定 id）。
//!     - 提供 Row→Dto 转换。

use std::collections::HashMap;

/// CLAUDE.md 单例记录的主键固定值（全表只有这一行）。
pub const CLAUDE_MD_ID: &str = "claude_md";

/// CLAUDE.md 数据库行 / 同步实体（snake_case）。
///
/// Business Logic: 持久化与跨设备同步需要与 Prompt 一致的 snake_case 命名，
///     以便 vector_clock 的 JSON 格式互通。字段加 `#[serde(default)]` 容错，
///     避免对端推送缺字段时整体反序列化失败。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClaudeMdRow {
    /// 主键，恒为 "claude_md"
    #[serde(default)]
    pub id: String,
    /// CLAUDE.md 正文文本
    #[serde(default)]
    pub content: String,
    /// 更新时间 ISO 字符串
    #[serde(default)]
    pub updated_at: String,
    /// 最后修改设备 ID
    #[serde(default)]
    pub device_id: String,
    /// 向量时钟 {device_id: counter}（CRDT 同步用）
    #[serde(default)]
    pub vector_clock: HashMap<String, u64>,
}

/// CLAUDE.md 前端 DTO（camelCase）。
///
/// Business Logic: 前端 TS 类型用 camelCase，与后端 snake_case 不一致，
///     需在 API 边界转换。前端无需感知固定 id，故不暴露。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMdDto {
    pub content: String,
    pub updated_at: String,
    pub device_id: String,
    pub vector_clock: HashMap<String, u64>,
}

impl ClaudeMdRow {
    /// 转换为前端 DTO（snake_case → camelCase，丢弃 id）。
    ///
    /// Business Logic: 命令层返回给前端前需做字段名转换。
    pub fn to_dto(&self) -> ClaudeMdDto {
        ClaudeMdDto {
            content: self.content.clone(),
            updated_at: self.updated_at.clone(),
            device_id: self.device_id.clone(),
            vector_clock: self.vector_clock.clone(),
        }
    }
}
