# Workbench Git History Tab Design

## Goal

Workbench 右侧检查器需要在当前 active worktree 下查看最近 Git 提交历史，并与现有项目文件夹树通过 tab 切换。这个视图用于快速确认 AI commit、手工 commit 和 merge 后的历史，而不是替代完整 Git 客户端。

## Behavior

- 右侧栏顶部提供两个 tab：项目文件夹、Git 历史。
- 项目文件夹 tab 保持现有文件树、刷新、新建、重命名、删除和路径信息能力。
- Git 历史 tab 绑定当前 active worktree，切换项目或 worktree 后重新加载。
- 每条提交显示短 hash、标题、作者和相对时间；最多展示最近 30 条。
- 非 Git 项目、无提交历史或 Git 命令失败时在 tab 内显示空态或错误，不影响终端与文件树。

## Architecture

- Rust `workbench/git.rs` 新增 `git log` porcelain 解析与 `list_commits` helper。
- Rust `commands/workbench.rs` 新增 `list_workbench_git_commits(projectId, worktreeId?, limit?)`，复用现有 worktree 解析边界。
- 前端 `workbenchApi` 增加 `git.listCommits` 分组方法。
- 前端 Workbench 页面维护 inspector tab、commit 列表 loading/error 状态，并在 active worktree 变化或提交成功后刷新历史。

## Testing

- Rust 单测覆盖 git log 解析、真实临时仓库读取最近提交。
- 前端 helper 测试覆盖 commit 时间格式或空态判断。
- 验证命令：`cargo test workbench:: --lib`、`cargo check`、`npx tsx src/pages/Workbench/workbenchWorktrees.test.ts`、`npm run build`。
