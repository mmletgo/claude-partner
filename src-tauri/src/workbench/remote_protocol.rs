//! workbench/remote_protocol.rs — Workbench 远端 HTTP 协议 DTO
//!
//! Business Logic（为什么需要这个模块）:
//!     Workbench 远端网关的 client 与 server route 需要共享请求体定义，避免协议字段漂移。
//!
//! Code Logic（这个模块做什么）:
//!     定义 `/api/workbench/...` 远端路由请求 DTO，统一使用 camelCase 序列化/反序列化。

use serde::{Deserialize, Serialize};

/// 远端项目 ID 请求体。
///
/// Business Logic（为什么需要这个结构体）:
///     远端 worktree/Git/files 路由都需要先知道对端设备上的本机项目记录 ID。
///
/// Code Logic（这个结构体做什么）:
///     使用 camelCase 序列化 `{projectId}`，供 client 发送和 axum 路由接收复用。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteProjectReq {
    pub project_id: String,
}

/// 远端创建 worktree 请求体。
///
/// Business Logic（为什么需要这个结构体）:
///     用户在本机 remote shortcut 上创建 worktree 时，实际 Git 操作必须在远端设备执行。
///
/// Code Logic（这个结构体做什么）:
///     保存远端 local projectId、分支名和可选 baseBranch，字段使用 camelCase。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCreateWorktreeReq {
    pub project_id: String,
    pub branch_name: String,
    pub base_branch: Option<String>,
}

/// 远端 Git 提交列表请求体。
///
/// Business Logic（为什么需要这个结构体）:
///     本机查看远端项目 Git 历史时，需要让远端按自己的 worktree 路径执行 `git log`。
///
/// Code Logic（这个结构体做什么）:
///     保存远端 local projectId、可选 worktreeId 和 limit，字段使用 camelCase。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteGitCommitsReq {
    pub project_id: String,
    pub worktree_id: Option<String>,
    pub limit: i64,
}

/// 远端文件树列表请求体。
///
/// Business Logic（为什么需要这个结构体）:
///     文件树展开操作需要在远端 active worktree 根内解析相对路径。
///
/// Code Logic（这个结构体做什么）:
///     保存远端 local projectId、可选 worktreeId 和可选相对 path；path 缺失表示项目根。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteListDirReq {
    pub project_id: String,
    pub worktree_id: Option<String>,
    pub path: Option<String>,
}

/// 远端路径信息请求体。
///
/// Business Logic（为什么需要这个结构体）:
///     远端文件树选中项需要读取远端设备上的真实 metadata。
///
/// Code Logic（这个结构体做什么）:
///     保存远端 local projectId、可选 worktreeId 和相对 path，字段使用 camelCase。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePathInfoReq {
    pub project_id: String,
    pub worktree_id: Option<String>,
    pub path: String,
}

/// 远端打开文件请求体。
///
/// Business Logic（为什么需要这个结构体）:
///     本机打开远端文件时，文件检测、预览和文本读取都必须在远端项目边界内完成。
///
/// Code Logic（这个结构体做什么）:
///     保存远端 local projectId、可选 worktreeId 和相对 path，字段使用 camelCase。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteOpenFileReq {
    pub project_id: String,
    pub worktree_id: Option<String>,
    pub path: String,
}

/// 远端保存文本请求体。
///
/// Business Logic（为什么需要这个结构体）:
///     远端文本保存要复用本地保存的类型校验和 baseHash 乐观锁，避免跨设备覆盖外部改动。
///
/// Code Logic（这个结构体做什么）:
///     保存远端 local projectId、可选 worktreeId、相对 path、UTF-8 content 和 baseHash。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSaveTextReq {
    pub project_id: String,
    pub worktree_id: Option<String>,
    pub path: String,
    pub content: String,
    pub base_hash: String,
}

/// 远端创建文件或目录请求体。
///
/// Business Logic（为什么需要这个结构体）:
///     新建文件/目录动作需要在远端设备上验证父路径和单个子名称。
///
/// Code Logic（这个结构体做什么）:
///     保存远端 local projectId、可选 worktreeId、parentPath 与 name。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCreatePathReq {
    pub project_id: String,
    pub worktree_id: Option<String>,
    pub parent_path: String,
    pub name: String,
}

/// 远端重命名路径请求体。
///
/// Business Logic（为什么需要这个结构体）:
///     远端重命名必须在远端工作区安全边界内执行，不能由本机拼接磁盘路径。
///
/// Code Logic（这个结构体做什么）:
///     保存远端 local projectId、可选 worktreeId、相对 path 与 newName。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteRenamePathReq {
    pub project_id: String,
    pub worktree_id: Option<String>,
    pub path: String,
    pub new_name: String,
}

/// 远端删除路径请求体。
///
/// Business Logic（为什么需要这个结构体）:
///     删除远端文件或目录必须由远端设备复用本地删除安全规则。
///
/// Code Logic（这个结构体做什么）:
///     保存远端 local projectId、可选 worktreeId 与相对 path。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDeletePathReq {
    pub project_id: String,
    pub worktree_id: Option<String>,
    pub path: String,
}
