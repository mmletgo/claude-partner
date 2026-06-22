//! screenshot/capture.rs — 抓屏、裁剪、快照、剪贴板写入
//!
//! Business Logic（为什么需要这个模块）:
//!     区域截图的核心能力：抓屏（物理像素帧）→ 裁剪选区 → 编码 PNG / 写系统剪贴板。
//!     编辑工具条流程下，抓屏与剪贴板写入解耦：前端 canvas 合成「桌面+标注」PNG 后，
//!     由 save_clipboard_from_png 解码写剪贴板；capture_region 仅供前端取选区桌面快照。
//!
//! Code Logic（这个模块做什么）:
//!     - `capture_monitor(display_index)`：取 xcap 第 index 显示器抓整屏（物理像素）。
//!     - `clamp_crop_rect(...)`：逻辑坐标 ×dpr → 物理像素 rect，clamp 到帧边界（纯函数，单测覆盖）。
//!     - `capture_region(...)`：抓屏 + clamp_crop_rect + crop_imm，返回选区 RgbaImage。
//!     - `region_to_png_base64(...)`：capture_region → PNG → base64 data URL（前端 canvas 背景）。
//!     - `save_clipboard_from_png(data_url)`：剥 data URL 前缀 → base64 解码 → image 解码 → arboard 写剪贴板。

use std::io::Cursor;

use arboard::{Clipboard, ImageData};
use image::RgbaImage;
use xcap::Monitor;

use crate::error::AppError;

/// 取第 `display_index` 个显示器对象。
///
/// Business Logic: `xcap::Monitor::all()` 顺序单进程内稳定，前端 Overlay 用同一 index 取快照/裁剪，
///     保证两处指向同一台显示器。
/// Code Logic: `Monitor::all()?` 枚举全部显示器，按 index 取，越界返回 Bad 错误。
fn get_monitor(display_index: usize) -> Result<Monitor, AppError> {
    let monitors = Monitor::all().map_err(|e| AppError::Bad(format!("枚举显示器失败: {e}")))?;
    monitors
        .into_iter()
        .nth(display_index)
        .ok_or_else(|| AppError::Bad(format!("显示器 index {display_index} 不存在")))
}

/// 抓取指定显示器的整屏帧（物理像素）。
///
/// Business Logic: 区域截图先抓整屏作裁剪源。xcap capture_image 返回物理像素（Retina 为逻辑 ×scale）。
/// Code Logic: `monitor.capture_image()` 直接返回 `image::RgbaImage`（物理像素）。
pub fn capture_monitor(display_index: usize) -> Result<RgbaImage, AppError> {
    let monitor = get_monitor(display_index)?;
    monitor
        .capture_image()
        .map_err(|e| AppError::Bad(format!("抓屏失败: {e}")))
}

/// 逻辑坐标 ×dpr → 物理像素 rect，clamp 到帧 `(img_w, img_h)` 边界。
///
/// Business Logic: 前端传逻辑像素 + dpr，xcap 帧是物理像素，需 ×dpr 换算；dpr 换算可能越界，clamp 防止
///     `crop_imm` panic。抽成纯函数便于单测。
/// Code Logic: 逐边 clamp：px>=img_w 收到 img_w-1；px+pw>img_w 截断 pw；pw/ph 为 0 返回 Err。
pub fn clamp_crop_rect(
    img_w: u32,
    img_h: u32,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    dpr: f64,
) -> Result<(u32, u32, u32, u32), AppError> {
    let scale = |v: u32| -> u32 { (v as f64 * dpr).round().max(0.0) as u32 };
    let mut px = scale(x);
    let mut py = scale(y);
    let mut pw = scale(w);
    let mut ph = scale(h);
    if px >= img_w {
        px = img_w.saturating_sub(1);
    }
    if py >= img_h {
        py = img_h.saturating_sub(1);
    }
    if px + pw > img_w {
        pw = img_w - px;
    }
    if py + ph > img_h {
        ph = img_h - py;
    }
    if pw == 0 || ph == 0 {
        return Err(AppError::Bad("裁剪区域为空（选区过小或越界）".into()));
    }
    Ok((px, py, pw, ph))
}

/// 抓指定显示器 + 按选区裁剪，返回选区 RgbaImage（物理像素）。
///
/// Business Logic: 编辑模式下前端需「该选区的纯桌面」作 canvas 背景；本函数返回裁剪后的选区帧。
/// Code Logic: `capture_monitor` → `clamp_crop_rect` → `crop_imm(...).to_image()`。
pub fn capture_region(
    display_index: usize,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    dpr: f64,
) -> Result<RgbaImage, AppError> {
    let img = capture_monitor(display_index)?;
    let (px, py, pw, ph) = clamp_crop_rect(img.width(), img.height(), x, y, w, h, dpr)?;
    Ok(image::imageops::crop_imm(&img, px, py, pw, ph).to_image())
}

/// 抓指定显示器选区并编码成 PNG base64 data URL（前端 canvas 背景）。
///
/// Business Logic: 前端编辑模式 canvas 需桌面快照作底图（drawImage），所见即所得。
/// Code Logic: `capture_region` → PNG 编码到 `Cursor<Vec<u8>>` → `base64::STANDARD` → 拼 data URL。
pub fn region_to_png_base64(
    display_index: usize,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    dpr: f64,
) -> Result<String, AppError> {
    let img = capture_region(display_index, x, y, w, h, dpr)?;
    let mut buf = Cursor::new(Vec::with_capacity(512 * 1024));
    img.write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| AppError::Bad(format!("PNG 编码失败: {e}")))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(buf.into_inner());
    Ok(format!("data:image/png;base64,{b64}"))
}

/// 把前端 canvas 合成的 PNG data URL 解码后写入系统剪贴板。
///
/// Business Logic: 用户点「确认」后，前端把「桌面选区 + 标注」合成的 PNG 传过来写剪贴板，
///     可直接粘贴到 Claude Code。
/// Code Logic: 剥 `data:image/png;base64,` 前缀 → base64 解码 → `image::load_from_memory` →
///     `to_rgba8()` → `arboard::ImageData` → `Clipboard::new()?.set_image(...)`。
pub fn save_clipboard_from_png(data_url: &str) -> Result<(), AppError> {
    let b64 = data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or_else(|| AppError::Bad("无效的 PNG data URL（缺少前缀）".into()))?;
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| AppError::Bad(format!("base64 解码失败: {e}")))?;
    let img = image::load_from_memory(&bytes)
        .map_err(|e| AppError::Bad(format!("PNG 解码失败: {e}")))?
        .to_rgba8();
    let (w_out, h_out) = (img.width() as usize, img.height() as usize);
    let img_data = ImageData {
        width: w_out,
        height: h_out,
        bytes: img.into_raw().into(),
    };
    let mut cb = Clipboard::new().map_err(|e| AppError::Bad(format!("打开剪贴板失败: {e}")))?;
    cb.set_image(img_data)
        .map_err(|e| AppError::Bad(format!("写入剪贴板失败: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::clamp_crop_rect;

    #[test]
    fn clamp_normal_within_bounds() {
        // 100×100 帧，选区 (10,10,30,30)，dpr=2 → 物理 (20,20,60,60)，右下到 (80,80) 未越界
        let (x, y, w, h) = clamp_crop_rect(100, 100, 10, 10, 30, 30, 2.0).unwrap();
        assert_eq!((x, y, w, h), (20, 20, 60, 60));
    }

    #[test]
    fn clamp_overflow_to_frame_edge() {
        let (x, y, w, h) = clamp_crop_rect(100, 100, 45, 45, 20, 20, 2.0).unwrap();
        assert_eq!((x, y, w, h), (90, 90, 10, 10));
    }

    #[test]
    fn clamp_empty_returns_err() {
        assert!(clamp_crop_rect(100, 100, 0, 0, 0, 10, 1.0).is_err());
    }
}
