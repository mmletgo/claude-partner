# UI 模块

## 概述

PyQt6 界面层，使用 Tab 布局组织多个功能面板。通过 qasync 桥接 asyncio 和 Qt 事件循环。

## 文件说明

- `__init__.py` → 导出 MainWindow, PromptPanel
- `main_window.py` → 主窗口（QTabWidget 三个 Tab：Prompt 管理 / 文件传输 / 设备列表）
- `prompt_panel.py` → Prompt 管理面板 + 编辑弹窗（PromptEditDialog）
- `widgets/` → 可复用 UI 组件，有独立 CLAUDE.md

## 主窗口 (MainWindow)

- Tab 布局：Prompt 管理 | 文件传输（占位） | 设备列表（占位）
- 窗口标题: "Claude Partner"，默认 900x600，最小 600x400
- 配色：浅色主题，蓝色系强调色 (#0078D4)

## Prompt 管理面板 (PromptPanel)

### 布局
- 顶部工具栏：搜索框（300ms 防抖）+ 标签筛选下拉框 + 新建按钮
- 中间：QScrollArea 卡片列表
- 空状态提示

### 功能
- 搜索和标签筛选可以同时生效（先按标签筛选再匹配关键词）
- 标签筛选下拉框含 "全部标签" + 所有已有标签
- 新建/编辑通过 PromptEditDialog 弹窗
- 删除有确认对话框（软删除）
- 复制将内容写入系统剪贴板

### 异步集成
- 同步信号槽中使用 `asyncio.ensure_future()` 启动异步操作
- 所有 repo 调用都是 async/await

### PromptEditDialog
- 编辑模式：传入 Prompt 预填数据，vector_clock 递增本设备计数器
- 新建模式：prompt=None，生成新 UUID，vector_clock = {device_id: 1}

## 依赖
- `claude_partner.models.prompt.Prompt`
- `claude_partner.storage.prompt_repo.PromptRepository`
- `claude_partner.config.AppConfig`
- `claude_partner.ui.widgets` (TagWidget, PromptCard)
