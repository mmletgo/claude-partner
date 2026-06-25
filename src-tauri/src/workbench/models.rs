//! workbench/models.rs — 工作台 DTO 与内部数据模型
//!
//! Business Logic（为什么需要这个模块）:
//!     前端工作台需要稳定的项目、会话、文件节点结构；后端也需要 SQLite row 表达项目记录。
//!
//! Code Logic（这个模块做什么）:
//!     定义 WorkbenchProjectRow/Dto、WorkbenchSessionRow/Dto、WorkbenchFileNode、WorkbenchPathInfo，
//!     所有前端 DTO 使用 camelCase。

#![allow(dead_code)]

use serde::{Deserialize, Serialize};

/// 工作台项目数据库行模型。
///
/// Business Logic（为什么需要这个结构体）:
///     用户添加过的本机项目需要持久化，重启后仍可出现在最近项目列表中。
///
/// Code Logic（这个结构体做什么）:
///     对齐 SQLite `workbench_projects` 表字段，保持 snake_case 供后端内部和 SQL 映射使用。
#[derive(Debug, Clone)]
pub struct WorkbenchProjectRow {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub device_id: String,
    pub device_name: String,
    pub path: String,
    pub last_opened_at: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 工作台项目 DTO。
///
/// Business Logic（为什么需要这个结构体）:
///     前端工作台需要展示最近项目列表，并使用 camelCase 字段与 TypeScript 类型对齐。
///
/// Code Logic（这个结构体做什么）:
///     序列化/反序列化工作台项目的 UI 合同，字段来自 `WorkbenchProjectRow`。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchProjectDto {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub device_id: String,
    pub device_name: String,
    pub path: String,
    pub last_opened_at: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Git worktree 状态摘要 DTO。
///
/// Business Logic（为什么需要这个结构体）:
///     Workbench 顶部 worktree 管理层需要展示当前分支是否有改动、是否领先/落后远端以及是否存在冲突。
///
/// Code Logic（这个结构体做什么）:
///     表达 `git status --porcelain --branch` 解析后的轻量状态，字段使用 camelCase 序列化给前端。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchGitStatusDto {
    pub branch: Option<String>,
    pub changed: usize,
    pub ahead: u32,
    pub behind: u32,
    pub conflicts: usize,
    pub clean: bool,
}

/// Git 提交历史项 DTO。
///
/// Business Logic（为什么需要这个结构体）:
///     Workbench 右侧 Git 历史 tab 需要展示 active worktree 的最近提交。
///
/// Code Logic（这个结构体做什么）:
///     表达 `git log` 的单条提交摘要，字段使用 camelCase 序列化给前端。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchGitCommitDto {
    pub hash: String,
    pub short_hash: String,
    pub author_name: String,
    pub author_email: String,
    pub authored_at: String,
    pub summary: String,
}

/// 工作台 Git worktree 数据库行模型。
///
/// Business Logic（为什么需要这个结构体）:
///     用户在 Workbench 中创建的 worktree 需要持久化，重启后仍能作为项目下的工作区切换。
///
/// Code Logic（这个结构体做什么）:
///     对齐 SQLite `workbench_worktrees` 表字段；Git 实时状态不落库，由命令层动态查询后注入 DTO。
#[derive(Debug, Clone)]
pub struct WorkbenchWorktreeRow {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub branch: Option<String>,
    pub base_branch: Option<String>,
    pub path: String,
    pub is_main: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// 工作台 Git worktree DTO。
///
/// Business Logic（为什么需要这个结构体）:
///     前端需要用 worktree strip 切换工作区，并在同一层展示分支状态和路径。
///
/// Code Logic（这个结构体做什么）:
///     将持久化 row 与运行期 Git 状态合并为 camelCase UI 合同。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchWorktreeDto {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub branch: Option<String>,
    pub base_branch: Option<String>,
    pub path: String,
    pub is_main: bool,
    pub status: WorkbenchGitStatusDto,
    pub created_at: String,
    pub updated_at: String,
}

impl WorkbenchProjectRow {
    /// Business Logic（为什么需要这个函数）:
    ///     前端只消费 camelCase DTO，数据库 row 不应直接泄露给 UI。
    ///
    /// Code Logic（这个函数做什么）:
    ///     克隆 row 字段并转换为 `WorkbenchProjectDto`。
    pub fn to_dto(&self) -> WorkbenchProjectDto {
        WorkbenchProjectDto {
            id: self.id.clone(),
            name: self.name.clone(),
            kind: self.kind.clone(),
            device_id: self.device_id.clone(),
            device_name: self.device_name.clone(),
            path: self.path.clone(),
            last_opened_at: self.last_opened_at.clone(),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
        }
    }
}

impl WorkbenchWorktreeRow {
    /// Business Logic（为什么需要这个函数）:
    ///     前端消费的是带 Git 状态的 DTO，数据库 row 只负责持久化 worktree 元数据。
    ///
    /// Code Logic（这个函数做什么）:
    ///     克隆 row 字段并注入调用方提供的 Git 状态摘要，转换为 `WorkbenchWorktreeDto`。
    pub fn to_dto(&self, status: WorkbenchGitStatusDto) -> WorkbenchWorktreeDto {
        WorkbenchWorktreeDto {
            id: self.id.clone(),
            project_id: self.project_id.clone(),
            name: self.name.clone(),
            branch: self.branch.clone(),
            base_branch: self.base_branch.clone(),
            path: self.path.clone(),
            is_main: self.is_main,
            status,
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
        }
    }
}

/// 工作台 terminal window DTO。
///
/// Business Logic（为什么需要这个结构体）:
///     前端需要展示本机项目 terminal window 状态、尺寸、退出信息以及 window 内 pane 数。
///
/// Code Logic（这个结构体做什么）:
///     定义 window 列表与状态事件可复用的数据形状，字段使用 camelCase 序列化。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchSessionDto {
    pub id: String,
    pub project_id: String,
    pub worktree_id: Option<String>,
    pub name: String,
    pub command: String,
    pub cwd: String,
    pub status: String,
    pub cols: u16,
    pub rows: u16,
    pub started_at: String,
    pub exited_at: Option<String>,
    pub exit_code: Option<i32>,
    pub supports_panes: bool,
    pub pane_count: usize,
}

/// 工作台 terminal window 数据库行模型。
///
/// Business Logic（为什么需要这个结构体）:
///     用户希望重启应用后之前打开的 terminal window 仍可恢复，因此 window 元数据需要独立于运行期 PTY 持久保存。
///
/// Code Logic（这个结构体做什么）:
///     对齐 SQLite `workbench_sessions` 表字段；backend_id 记录项目 tmux session，backend_window_id 记录 tmux window，
///     DTO 投影仍只暴露前端展示所需字段。
#[derive(Debug, Clone)]
pub struct WorkbenchSessionRow {
    pub id: String,
    pub project_id: String,
    pub worktree_id: Option<String>,
    pub name: String,
    pub command: String,
    pub cwd: String,
    pub status: String,
    pub cols: u16,
    pub rows: u16,
    pub started_at: String,
    pub exited_at: Option<String>,
    pub exit_code: Option<i32>,
    pub backend: String,
    pub backend_id: Option<String>,
    pub backend_window_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl WorkbenchSessionRow {
    /// Business Logic（为什么需要这个函数）:
    ///     前端会话列表只需要 UI 字段，不应暴露后端重连实现细节。
    ///
    /// Code Logic（这个函数做什么）:
    ///     克隆持久化 row 的展示字段，转换为 `WorkbenchSessionDto`，pane 数默认按单 pane 处理。
    pub fn to_dto(&self) -> WorkbenchSessionDto {
        self.to_dto_with_pane_count(1)
    }

    /// Business Logic（为什么需要这个函数）:
    ///     项目列表需要显示真实 pane 数，而该数据来自运行期 tmux 查询，不属于 SQLite row。
    ///
    /// Code Logic（这个函数做什么）:
    ///     克隆 row 字段并注入调用方计算出的 pane_count，生成前端 camelCase DTO。
    pub fn to_dto_with_pane_count(&self, pane_count: usize) -> WorkbenchSessionDto {
        WorkbenchSessionDto {
            id: self.id.clone(),
            project_id: self.project_id.clone(),
            worktree_id: self.worktree_id.clone(),
            name: self.name.clone(),
            command: self.command.clone(),
            cwd: self.cwd.clone(),
            status: self.status.clone(),
            cols: self.cols,
            rows: self.rows,
            started_at: self.started_at.clone(),
            exited_at: self.exited_at.clone(),
            exit_code: self.exit_code,
            supports_panes: self.backend == "tmux" && self.backend_window_id.is_some(),
            pane_count,
        }
    }
}

/// 工作台文件树节点 DTO。
///
/// Business Logic（为什么需要这个结构体）:
///     工作台右侧文件树需要统一表示文件夹、文件、大小、修改时间和懒加载子节点。
///
/// Code Logic（这个结构体做什么）:
///     表达一项文件系统节点，children 为 None 表示未加载或非目录。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchFileNode {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: Option<u64>,
    pub modified_at: Option<String>,
    pub children: Option<Vec<WorkbenchFileNode>>,
}

/// 工作台路径信息 DTO。
///
/// Business Logic（为什么需要这个结构体）:
///     创建、重命名、查询路径后，前端需要拿到目标路径的最新元信息以刷新文件树。
///
/// Code Logic（这个结构体做什么）:
///     表达单个路径的名称、相对路径、类型、大小和修改时间，字段使用 camelCase 序列化。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchPathInfo {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: Option<u64>,
    pub modified_at: Option<String>,
}
