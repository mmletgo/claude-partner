//! commands/scratchpad.rs — 速记本多页面 invoke 命令
//!
//! Business Logic（为什么需要这个模块）:
//!     前端 Scratchpad 页面需要列出页面、读取页面详情、创建页面、自动保存内容、重命名和删除页面。
//!     内容权威源从 localStorage 迁移到 Rust/SQLite 后，所有页面操作都必须走这些命令。
//!
//! Code Logic（这个模块做什么）:
//!     每个命令只做 IPC 参数适配与 DTO 投影，具体 CRUD/向量时钟推进由 ScratchpadRepo 负责；
//!     `sync_scratchpad` 复用全局 trigger_sync，使 scratchpad 随 prompts/cc/ssh 一起同步。

use crate::error::AppError;
use crate::models::scratchpad::{ScratchpadPageDto, ScratchpadPageSummaryDto};
use crate::state::AppState;
use crate::sync::engine;
use tauri::State;

/// 删除速记本页面结果（camelCase）。
///
/// Business Logic: 前端删除当前页面后只需要确认操作成功并知道被删除的页面 id。
/// Code Logic: serde 在 IPC 边界输出 `{ok,pageId}`。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScratchpadDeleteResult {
    pub ok: bool,
    pub page_id: String,
}

/// 列出所有未删除速记本页面摘要。
///
/// Business Logic: 侧栏需要展示所有可用页面，并按最近更新时间排序。
/// Code Logic: repo.list_pages 返回完整 Row；命令层投影为 summary DTO，避免传输大 content。
#[tauri::command]
pub async fn list_scratchpad_pages(
    state: State<'_, AppState>,
) -> Result<Vec<ScratchpadPageSummaryDto>, AppError> {
    let pages = state.scratchpad_repo.list_pages().await?;
    Ok(pages.iter().map(|p| p.to_summary_dto()).collect())
}

/// 获取单个速记本页面详情。
///
/// Business Logic: 页面打开时按 pageId 加载标题、内容和保存状态；默认页不存在时自动创建。
/// Code Logic: pageId="scratchpad" 走 get_or_create_default_page，其余 id 不存在则返回 not-found。
#[tauri::command]
pub async fn get_scratchpad_page(
    state: State<'_, AppState>,
    page_id: String,
) -> Result<ScratchpadPageDto, AppError> {
    let row = if page_id == crate::models::scratchpad::SCRATCHPAD_ID {
        state
            .scratchpad_repo
            .get_or_create_default_page(state.device_id.as_str())
            .await?
    } else {
        state
            .scratchpad_repo
            .get(&page_id)
            .await?
            .ok_or_else(|| AppError::not_found(format!("速记本页面不存在: {page_id}")))?
    };
    Ok(row.to_dto())
}

/// 创建新的速记本页面。
///
/// Business Logic: 用户新增页面时可只传标题；空标题归一为“未命名”，内容初始为空。
/// Code Logic: repo.create_page 负责 UUID、created_at/updated_at 和 vector_clock 初始化。
#[tauri::command]
pub async fn create_scratchpad_page(
    state: State<'_, AppState>,
    title: Option<String>,
) -> Result<ScratchpadPageDto, AppError> {
    let row = state
        .scratchpad_repo
        .create_page(
            title.as_deref().unwrap_or("未命名"),
            "",
            state.device_id.as_str(),
            None,
        )
        .await?;
    Ok(row.to_dto())
}

/// 更新速记本页面内容；用于自动保存和清空。
///
/// Business Logic: 用户编辑应自动持久化到 SQLite，并推进 vector_clock 供局域网/GitHub 同步感知。
/// Code Logic: repo.update_page_content 负责保留 created_at/title、更新 updated_at、递增当前设备时钟。
#[tauri::command]
pub async fn update_scratchpad_page_content(
    state: State<'_, AppState>,
    page_id: String,
    content: String,
) -> Result<ScratchpadPageDto, AppError> {
    let row = state
        .scratchpad_repo
        .update_page_content(&page_id, &content, state.device_id.as_str())
        .await?;
    Ok(row.to_dto())
}

/// 重命名速记本页面。
///
/// Business Logic: 标题是页面核心元数据，需要持久化并参与同步。
/// Code Logic: repo.rename_page 负责空标题归一化、更新时间和向量时钟推进。
#[tauri::command]
pub async fn rename_scratchpad_page(
    state: State<'_, AppState>,
    page_id: String,
    title: String,
) -> Result<ScratchpadPageDto, AppError> {
    let row = state
        .scratchpad_repo
        .rename_page(&page_id, &title, state.device_id.as_str())
        .await?;
    Ok(row.to_dto())
}

/// 删除速记本页面（软删除）。
///
/// Business Logic: 删除必须传播到其他设备和云端，因此只标记 deleted，不物理删除。
/// Code Logic: repo.soft_delete_page 推进本设备向量时钟，返回被删除页面详情供前端更新状态。
#[tauri::command]
pub async fn delete_scratchpad_page(
    state: State<'_, AppState>,
    page_id: String,
) -> Result<ScratchpadDeleteResult, AppError> {
    let row = state
        .scratchpad_repo
        .soft_delete_page(&page_id, state.device_id.as_str())
        .await?;
    Ok(ScratchpadDeleteResult {
        ok: true,
        page_id: row.id,
    })
}

/// 手动触发速记本局域网同步。
///
/// Business Logic: Scratchpad 页面提供“局域网同步”按钮；全局 trigger_sync 已纳入 scratchpad，
///     因此这里复用同一同步入口，避免维护两套设备遍历逻辑。
/// Code Logic: 调 sync::engine::trigger_sync 并序列化为前端已有的 `{accepted,synced,note}` 结构。
#[tauri::command]
pub async fn sync_scratchpad(state: State<'_, AppState>) -> Result<serde_json::Value, AppError> {
    let result = engine::trigger_sync(state.inner()).await;
    Ok(serde_json::to_value(&result)?)
}
