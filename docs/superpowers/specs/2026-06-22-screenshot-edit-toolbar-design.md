# 区域截图编辑工具条设计（方案 A：canvas 所见即所得）

## Context（为什么做）

当前区域截图流程：框选 → mouseup 直接 `crop_and_copy` 裁剪复制剪贴板。用户希望学习微信截图：框选后**进入编辑模式**，通过工具条在截图上添加标注（矩形/箭头，颜色可选），**确认后**才合成「桌面选区 + 标注」复制剪贴板。这样用户可在截图上圈画重点再粘贴到 Claude Code。

基线：`26b58cb`（微信风格遮罩 + 多屏几何订正 + 蓝色边框修复已合入 master）。

## 需求（已与用户确认）

1. **标注工具**：矩形 + 箭头（两种）
2. **保存**：点「确认」→ 合成（桌面选区 + 标注）复制到剪贴板（对齐粘贴到 Claude Code 的用途）
3. **编辑能力**：可画多个标注叠加；工具条「撤销」去掉最后一个；选区框定后固定不可调整
4. **颜色**：预设 6 色板（红/黄/绿/蓝/白/黑）+ 固定线宽 3px（×dpr 物理清晰）

## 技术方案（方案 A）

**前端 canvas 绘制 + 前端合成（所见即所得）**：

- 框选确定后，Rust 抓「该选区的纯桌面快照」（hiding 机制排除 overlay）以 base64 传前端
- 编辑模式：前端 `<canvas>` 先 `drawImage` 桌面快照、再叠加标注 —— 用户在 canvas 上画，所见即最终图
- 确认时 `canvas.toDataURL` 得「桌面+标注」合成图 → 传 Rust 写剪贴板
- Rust 只管抓快照 / 写剪贴板，**不画标注**（一致性由单一绘制层保证）

## 详细设计

### Overlay 状态机

| 状态 | 表现 | 转换 |
|---|---|---|
| `idle` | 整屏半透明遮罩 | mousedown → `selecting` |
| `selecting` | 四块遮罩 + 蓝虚线选区边框 | mouseup 有效 → `editing`；无效 → `cancel` |
| `editing` | 选区内 canvas + 工具条，选区外四块遮罩 | 确认 → 写剪贴板 + close；取消/ESC → close |

### 编辑模式布局

- **选区内**：`<canvas>` 绝对定位 `left:x, top:y, width:w, height:h`，内含桌面快照 + 标注层
- **选区外**：四块半透明遮罩（保持暗，与框选时一致）
- **工具条**：默认选区下方居中（`top: y+h+8`，水平居中于选区）；若 `y+h+工具条高 > 窗口高` 则翻到选区上方（`top: y-工具条高-8`）

### 工具条

```
[▭矩形] [→箭头]  │  [●红 ●黄 ●绿 ●蓝 ●白 ●黑]  │  [↶撤销] [✓确认] [✕取消]
```

- **矩形/箭头**：单选，当前工具高亮
- **6 色板**：`#FF3B30 #FFCC00 #34C759 #007AFF #FFFFFF #000000`，当前色描边高亮
- **线宽**：固定 3px（逻辑），canvas 绘制时 `×dpr` 物理像素
- **撤销**：pop 标注数组末尾
- **✓ 确认**：canvas 合成 → 写剪贴板 → 关闭所有 overlay
- **✕ 取消 / ESC**：关闭所有 overlay

### 标注数据与绘制

```ts
type Tool = 'rect' | 'arrow';
interface Annotation {
  tool: Tool;
  color: string;          // #RRGGBB
  x1: number; y1: number; // 选区内逻辑坐标（起点）
  x2: number; y2: number; // 选区内逻辑坐标（终点）
}
```

- **画法**（editing 内 canvas 上的鼠标）：
  - mousedown：记起点 `(x1,y1)`，进 `drawing` 子态
  - mousemove：更新终点 `(x2,y2)`，重绘 canvas（快照 + 已有标注 + 当前预览）
  - mouseup：把当前标注 push 进数组，退出 `drawing`
- **canvas 重绘**：
  1. `ctx.drawImage(snapshotImg, 0, 0, canvasW, canvasH)`（快照铺满）
  2. 遍历 `annotations`：
     - `rect`：`strokeRect(min(x1,x2), min(y1,y2), |x2-x1|, |y2-y1|)`，strokeStyle=color，lineWidth=`3*dpr`
     - `arrow`：主线 `(x1,y1)→(x2,y2)` + 终点三角头（按线角度旋转，边长≈`12*dpr`）
- **撤销**：`annotations.pop()` + 重绘

### canvas 物理清晰

- canvas 元素 CSS 尺寸 = 选区逻辑 `w×h`
- canvas 内部像素缓冲 = `w*dpr × h*dpr`（`canvas.width = Math.round(w*dpr)`），`ctx.scale(dpr,dpr)` 后用逻辑坐标绘制，保证 Retina 清晰

### Rust 命令（新增/替换）

| 命令 | 作用 | 实现 |
|---|---|---|
| `get_region_snapshot(display, x, y, w, h, dpr)` | hiding 后抓纯桌面 → 裁剪到选区 → base64 PNG | `capture::capture_region`（抓屏+裁剪，复用现有 crop 边界 clamp 逻辑）+ PNG 编码 base64 |
| `save_clipboard_image(dataUrl)` | 解码 base64 PNG → arboard 写剪贴板 | 剥 `data:image/png;base64,` 前缀 → base64 解码 → `image::load_from_memory` → `RgbaImage` → `arboard::ImageData` |
| 移除 `crop_and_copy` | 被编辑流程取代（规则 15 不向后兼容） | 删 `commands::screenshot.rs::crop_and_copy` + lib.rs 注册 + `capture::crop_and_copy` 拆出可复用部分 |
| 保留 `start_region_capture` / `cancel_region_capture` | 不变 | — |

`capture.rs` 重构：现有 `crop_and_copy`（抓屏+裁剪+写剪贴板）拆为 `capture_region(display,x,y,w,h,dpr) -> RgbaImage`（抓+裁，不写剪贴板）；写剪贴板由新 `save_clipboard_image` 命令负责（解码前端合成的 PNG）。

### 关键流程时序

**进入编辑**：
1. mouseup 有效选区 → `setHiding(true)` → 双 rAF（等遮罩/边框消失渲染到屏幕）
2. `invoke get_region_snapshot(display,x,y,w,h,dpr)` → Rust 抓纯桌面裁剪 → base64
3. 拿到快照 → `setHiding(false)` + `setMode('editing')` + 加载快照到 Image + canvas 初始重绘

**确认**：
1. `canvas.toDataURL('image/png')`（含桌面+标注，所见即所得）
2. `invoke save_clipboard_image(dataUrl)` → Rust 解码写剪贴板
3. 成功 → 关闭所有 overlay；失败 → 保留 editing 让用户重试

**取消**：ESC / 工具条 ✕ → `invoke cancel_region_capture` → 关闭所有 overlay

### 错误处理

- **快照失败**（`get_region_snapshot` reject）：回退 `selecting`，让用户重选
- **写剪贴板失败**（`save_clipboard_image` reject）：保留 `editing`，工具条提示，用户可重试确认
- **选区边界**：`capture_region` 沿用现有 clamp 到帧边界逻辑，防 dpr 换算越界 panic

### capabilities

`screenshot-overlay-*` 窗口已通配（现有）；新增命令 `get_region_snapshot` / `save_clipboard_image` 在同一 overlay 窗口 invoke，按窗口 label 鉴权已放行，无需额外 capability。移除 `crop_and_copy` 同理。

## 文件改动清单

### 前端
- `web/src/pages/Screenshot/Overlay.tsx`：重构为状态机（idle/selecting/editing）+ 工具条 + canvas 标注绘制 + 颜色板 + 撤销
- `web/src/pages/Screenshot/Overlay.module.css`：新增工具条 / 颜色板 / canvas 样式
- **组件拆分**（若 Overlay.tsx 膨胀）：抽 `ScreenshotToolbar.tsx`（工具条 + 颜色板）、`useAnnotationCanvas` hook（绘制重绘逻辑）。目标每个文件单一职责、可独立理解

### Rust
- `src-tauri/src/screenshot/capture.rs`：`crop_and_copy` 拆为 `capture_region -> RgbaImage`；新增 `region_to_png_base64`（裁剪到选区 + PNG base64）；新增 `save_clipboard_from_png(data_url) -> ()`
- `src-tauri/src/commands/screenshot.rs`：`get_region_snapshot`、`save_clipboard_image` 命令；移除 `crop_and_copy`
- `src-tauri/src/lib.rs`：invoke_handler 注册更新（加 `get_region_snapshot` + `save_clipboard_image`、删 `crop_and_copy`）
- `src-tauri/src/screenshot/mod.rs`：模块注释更新

### 文档
- `src-tauri/CLAUDE.md` M6 节：编辑流程（`get_region_snapshot` / `save_clipboard_image`）、移除 `crop_and_copy`、canvas 标注、状态机
- `web/CLAUDE.md` Overlay 条目：编辑模式状态机 + 工具条 + canvas 标注

## 验证

1. `cd src-tauri && cargo build` —— 编译通过、无未使用警告
2. `cd web && npx tsc --noEmit` —— 类型通过
3. `./start.sh` dev 三屏实测：
   - 框选 → 进入编辑模式（工具条出现，选区显示桌面快照，选区外暗）
   - 选矩形/箭头 + 颜色，画多个标注叠加；撤销去掉最后一个
   - 确认 → 粘贴到 Claude Code，图含桌面+标注、**无蓝色边框、无遮罩**
   - ESC / ✕ 取消 → 正常关闭
   - 三屏各自独立编辑（每屏 overlay 独立 canvas + 工具条实例）

## 不做（YAGNI）

- 选区调整（拖拽手柄改大小/位置）
- 标注选中/移动/单独删除（仅撤销最后一个）
- 自定义颜色选择器（仅 6 色板）
- 线宽可调（固定 3px）
- 文字 / 马赛克 / 自由画笔等其他工具
- 钉图 / 保存到文件
