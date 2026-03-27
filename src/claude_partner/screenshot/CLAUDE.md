# screenshot/ - 截图模块

## 模块职责
提供区域截图功能，用户可框选屏幕区域截图，截图自动复制到剪贴板，可直接粘贴到 Claude Code。

## 文件结构

| 文件 | 职责 |
|------|------|
| `__init__.py` | 模块入口，导出 ScreenshotManager 和 ScreenshotOverlay |
| `overlay.py` | 全屏半透明覆盖层，处理鼠标选区交互和绘制 |
| `capture.py` | 截图管理器，协调截图流程和剪贴板操作 |

## 核心类

### ScreenshotOverlay (`overlay.py`)
- **功能**: 全屏覆盖层，截取桌面后让用户拖动选择区域
- **信号**: `screenshot_taken(QPixmap)`, `screenshot_cancelled()`
- **多显示器**: 使用 `virtualGeometry()` 获取所有屏幕组合区域
- **绘制逻辑**: 全屏截图背景 -> 半透明遮罩(alpha=100) -> 选区内绘制原图(去遮罩) -> 蓝色虚线边框(#0078D4, 2px)
- **选区要求**: 最小 10x10 像素，小于此大小视为取消
- **快捷键**: ESC 取消截图

### ScreenshotManager (`capture.py`)
- **功能**: 管理截图流程，连接覆盖层信号，处理剪贴板操作
- **信号**: `screenshot_ready(QPixmap)`
- **流程**: 创建 Overlay -> 用户选区 -> 复制到剪贴板 -> 发射 ready 信号 -> 清理 Overlay
