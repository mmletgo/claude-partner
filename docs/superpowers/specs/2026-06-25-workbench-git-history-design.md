# Workbench Git History Tab Design

## Goal

Workbench 右侧检查器需要在当前 active worktree 下查看类似 VS Code 的 Git 提交树，并与现有项目文件夹树通过 tab 切换。这个视图用于快速确认 AI commit、手工 commit、push 和 merge 后的本地/云端位置，而不是替代完整 Git 客户端。

## Behavior

- 右侧栏顶部提供两个 tab：项目文件夹、Git 历史。
- 项目文件夹 tab 保持现有文件树、刷新、新建、重命名、删除和路径信息能力。
- Git 历史 tab 绑定当前 active worktree，切换项目或 worktree 后重新加载。
- Git 历史 tab 顶部提供当前 active worktree 的状态、Commit、Push、Merge；顶部 worktree 管理层只保留切换、新建和移除 worktree。
- Push 按钮只在当前 worktree 有分支且后端 status 判定存在可用推送目标时启用；本地未发布、没有 origin/upstream 的项目保持禁用，只有 `*-upstream` 这类源码上游 remote 也不能启用。
- 每条提交显示 VS Code 风格多 lane graph、短 hash、标题、作者和相对时间；最多展示最近 30 条。
- 提交旁展示 local / remote / tag ref badge：本地分支用 local 色，远端分支用云端色与上传图标，tag 用独立色。
- 非 Git 项目、无提交历史或 Git 命令失败时在 tab 内显示空态或错误，不影响终端与文件树。

## Architecture

- Rust `workbench/git.rs` 使用 `git log --all --topo-order --decorate=full` 解析提交、父提交和 refs。
- Rust `workbench/git.rs` 在 worktree status 中派生 `canPush`，规则与 push 命令的 upstream/origin 选择保持一致；不会把唯一的 non-origin remote 当作默认发布目标。
- Rust `commands/workbench.rs` 新增 `list_workbench_git_commits(projectId, worktreeId?, limit?)`，复用现有 worktree 解析边界。
- 前端 `workbenchApi` 增加 `git.listCommits` 分组方法。
- 前端 helper 根据 parent hashes 计算 graph lane，并集中判断 Git 历史工具条的 Commit/Push/Merge 可用性；Workbench 页面维护 inspector tab、commit graph loading/error 状态，并在 active worktree 变化或提交成功后刷新历史。

## Testing

- Rust 单测覆盖 git log 解析、refs 分类、真实临时仓库读取最近提交。
- Rust 单测覆盖无 remote 或 upstream-only remote 时 `canPush=false`、有 origin remote 时 `canPush=true`。
- 前端 helper 测试覆盖 commit 时间格式、空态判断、Git 操作可用性、本地未发布项目禁用 Push 和 merge graph lane 计算。
- 验证命令：`cargo test workbench:: --lib`、`cargo check`、`npx tsx src/pages/Workbench/workbenchWorktrees.test.ts`、`npm run build`。
