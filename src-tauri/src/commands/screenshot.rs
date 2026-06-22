//! commands/screenshot.rs — 区域截图命令（本地前端 invoke）
//!
//! Business Logic（为什么需要这个模块）:
//!     前端通过 invoke 触发区域截图流程：开选区窗口、进编辑模式取选区快照、确认后写剪贴板、取消。
//!
//! Code Logic（这个模块做什么）:
//!     - `start_region_capture(app)`：每屏建透明置顶选区窗口。
//!     - `get_region_snapshot(display, x, y, w, h, dpr)`：抓该屏纯桌面选区，返回 PNG base64。
//!     - `save_clipboard_image(app, dataUrl)`：把前端合成的 PNG data URL 写剪贴板 + 关全部 overlay。
//!     - `cancel_region_capture(app)`：emit `region-capture:result` {cancelled:true}，关全部 overlay。

use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::error::AppError;
use crate::screenshot::{capture, overlay};

/// 启动区域截图：为每个显示器创建选区窗口。
#[tauri::command]
pub async fn start_region_capture(app: AppHandle) -> Result<(), AppError> {
    overlay::start_region_capture(&app)
}

/// 获取指定显示器选区的纯桌面快照（PNG base64），供前端编辑模式 canvas 作背景。
///
/// Business Logic: 用户框选确定进编辑模式时，需「该选区不含 overlay 的纯桌面」作 canvas 底图
///     （前端在 invoke 前已 hiding 隐藏 overlay，故 Rust 抓到的是纯桌面）。
/// Code Logic: 调 `capture::region_to_png_base64`，返回 `data:image/png;base64,...`。
#[tauri::command]
pub async fn get_region_snapshot(
    display: usize,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    dpr: f64,
) -> Result<String, AppError> {
    capture::region_to_png_base64(display, x, y, w, h, dpr)
}

/// 把前端 canvas 合成的「桌面+标注」PNG 写入剪贴板，并关闭所有 overlay。
///
/// Business Logic: 用户点「确认」后，前端把 canvas.toDataURL（桌面选区 + 标注）传过来，
///     Rust 解码写剪贴板（可直接粘贴到 Claude Code），成功后关 overlay。
/// Code Logic: `capture::save_clipboard_from_png` → emit `region-capture:result` {ok:true} → `overlay::close_all_overlays`。
#[tauri::command]
pub async fn save_clipboard_image(app: AppHandle, data_url: String) -> Result<(), AppError> {
    capture::save_clipboard_from_png(&data_url)?;
    let _ = app.emit("region-capture:result", json!({ "ok": true }));
    overlay::close_all_overlays(&app);
    Ok(())
}

/// 取消区域截图。
#[tauri::command]
pub async fn cancel_region_capture(app: AppHandle) -> Result<(), AppError> {
    let _ = app.emit("region-capture:result", json!({ "cancelled": true }));
    overlay::close_all_overlays(&app);
    Ok(())
}
