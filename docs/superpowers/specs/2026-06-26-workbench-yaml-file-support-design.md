# Workbench YAML File Support Design

## Goal

工作台文件工作区支持 `.yaml` / `.yml` 文件作为结构化文本文件打开、代码高亮、格式化和保存前语义校验。YAML 体验应与现有 JSON / TOML 路径保持一致，不改变工作台主结构。

## User-Approved Behavior

- `.yaml` / `.yml` 文件识别为 `yaml`，不再落到普通 `code` 类型。
- YAML 文件使用 CodeMirror YAML 语言插件，并继承当前 One Dark Pro 风格高亮。
- YAML 文件显示“格式化”能力；点击格式化时重排为语义等价、缩进统一的 YAML 文本。
- YAML 文件保存前必须先通过语义校验；校验失败时阻止保存并展示错误。
- 格式化可接受“语义格式化”：不保证完整保留原始注释位置、空行排版、锚点排版等手写格式细节。普通编辑和保存不会自动重排，只有用户触发格式化时才会重排。

## Architecture

YAML 走现有结构化文件管线，而不是新增预览框架：

1. 前端类型与能力矩阵新增 `yaml`，让 tab reducer、保存状态、格式化按钮、校验路径复用 JSON / TOML 逻辑。
2. CodeMirror 编辑器新增 YAML language extension，One Dark Pro 主题继续只负责 token 着色。
3. 前端格式化与即时校验使用 npm `yaml` 包，保证用户点击格式化和保存前能快速得到错误。
4. Rust 后端文件识别、能力声明、保存前校验和格式化新增 YAML 分支，作为最终可信边界。
5. 文档同步更新 `docs/prd.md`、`web/CLAUDE.md`、`src-tauri/CLAUDE.md`，保持项目记忆准确。

## Error Handling

- 前端保存前校验失败时，沿用当前 JSON / TOML 的 dirty tab 错误展示方式，不调用保存命令。
- 后端保存校验失败时返回 `AppError::validation`，前端按现有 API 错误展示。
- 格式化失败不修改编辑器内容。

## Testing

- 前端 `workbenchFiles.test.ts` 覆盖 `.yaml` / `.yml` 类型识别、能力矩阵、保存前必须校验。
- 前端 `WorkbenchCodeEditor` 相关测试覆盖 YAML language extension 可以加入编辑器 extension 集合。
- Rust `file_preview` 测试覆盖 YAML 类型识别和能力。
- Rust `file_content` 测试覆盖 YAML 格式化成功与语法错误失败。
- Rust command 层测试覆盖保存前 YAML 校验。
- 验证命令限定在 Workbench 相关前端测试、lint/build、Rust workbench 相关测试和 `cargo check`。
