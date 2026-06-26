//! net/routes/workbench.rs — Workbench 远端 HTTP 路由
//!
//! Business Logic（为什么需要这个模块）:
//!     局域网设备需要通过现有 P2P HTTP server 暴露 Workbench 远端目录浏览与项目打开能力。
//!
//! Code Logic（这个模块做什么）:
//!     将远端目录 helper 和本机项目添加逻辑包装为 axum handler，供其他设备调用。

use crate::commands::workbench::{
    add_local_workbench_project_from_path, local_create_workbench_dir, local_create_workbench_file,
    local_create_workbench_worktree, local_delete_workbench_path, local_get_workbench_path_info,
    local_list_workbench_dir, local_list_workbench_git_commits, local_list_workbench_worktrees,
    local_open_workbench_file, local_rename_workbench_path, local_save_workbench_text_file,
};
use crate::error::AppError;
use crate::state::AppState;
use crate::workbench::models::{
    WorkbenchFileNode, WorkbenchGitCommitDto, WorkbenchOpenFileDto, WorkbenchPathInfo,
    WorkbenchProjectDto, WorkbenchProjectRow, WorkbenchRemoteDirectoryEntryDto,
    WorkbenchRemotePathInfoDto, WorkbenchRemoteRootDto, WorkbenchSaveTextResultDto,
    WorkbenchWorktreeDto,
};
use crate::workbench::remote_directory;
use crate::workbench::remote_protocol::{
    RemoteCreatePathReq, RemoteCreateWorktreeReq, RemoteDeletePathReq, RemoteGitCommitsReq,
    RemoteListDirReq, RemoteOpenFileReq, RemotePathInfoReq, RemoteProjectReq, RemoteRenamePathReq,
    RemoteSaveTextReq,
};
use axum::extract::State;
use axum::Json;
use std::path::Path;

/// 远端路径请求体。
///
/// Business Logic（为什么需要这个结构体）:
///     对端浏览目录、读取路径信息和打开项目时都只需要传递一个远端设备上的绝对路径。
///
/// Code Logic（这个结构体做什么）:
///     反序列化 camelCase JSON 请求体 `{path}`，供 axum handler 使用。
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePathReq {
    pub path: String,
}

/// Business Logic（为什么需要这个函数）:
///     所有远端路径类接口都必须拒绝空输入，避免误把空串解释为当前工作目录。
///
/// Code Logic（这个函数做什么）:
///     检查 path trim 后是否为空；为空返回统一中文业务错误，否则保留原始路径字符串。
fn validate_remote_path(path: String) -> Result<String, AppError> {
    if path.trim().is_empty() {
        return Err(AppError::generic("路径不能为空"));
    }
    Ok(path)
}

/// Business Logic（为什么需要这个函数）:
///     Workbench P2P 网关协议只接受对端本机 local projectId，不能把 remote shortcut 当成本机项目递归代理。
///
/// Code Logic（这个函数做什么）:
///     检查项目 row 的 kind 是否为 local；非 local 返回清晰协议错误。
fn ensure_remote_gateway_local_project(project: &WorkbenchProjectRow) -> Result<(), AppError> {
    if project.kind != "local" {
        return Err(AppError::generic("远端 Workbench 网关只接受对端本机项目"));
    }
    Ok(())
}

/// Business Logic（为什么需要这个函数）:
///     每个 Workbench 远端 worktree/Git/files handler 在调用本地 helper 前都必须先确认项目类型。
///
/// Code Logic（这个函数做什么）:
///     从 Workbench 项目仓库读取 projectId，缺失时返回协议错误，存在时复用 kind guard。
async fn ensure_remote_gateway_local_project_id(
    state: &AppState,
    project_id: &str,
) -> Result<(), AppError> {
    let project = state
        .workbench_project_repo
        .get(project_id)
        .await?
        .ok_or_else(|| AppError::not_found("远端 Workbench 项目不存在"))?;
    ensure_remote_gateway_local_project(&project)
}

/// 返回远端设备可浏览的目录根入口。
///
/// Business Logic（为什么需要这个函数）:
///     用户在另一台设备上添加项目时，需要先看到该设备上的 Home、下载、常用代码目录等入口。
///
/// Code Logic（这个函数做什么）:
///     调用 Workbench remote_directory helper 生成根目录 DTO，并包装为 axum Json。
pub async fn remote_roots() -> Result<Json<Vec<WorkbenchRemoteRootDto>>, AppError> {
    Ok(Json(remote_directory::remote_roots()))
}

/// 列出远端设备某个目录下的一级条目。
///
/// Business Logic（为什么需要这个函数）:
///     远端项目选择器需要逐层浏览对端文件系统，直到用户选中项目目录。
///
/// Code Logic（这个函数做什么）:
///     校验 path 非空后调用 `list_remote_directory`，返回目录优先排序的条目列表。
pub async fn remote_list_dir(
    Json(req): Json<RemotePathReq>,
) -> Result<Json<Vec<WorkbenchRemoteDirectoryEntryDto>>, AppError> {
    let path = validate_remote_path(req.path)?;
    Ok(Json(remote_directory::list_remote_directory(Path::new(
        &path,
    ))?))
}

/// 返回远端设备某个路径的详情。
///
/// Business Logic（为什么需要这个函数）:
///     用户选中目录后，前端需要知道它是否可读、是否是 Git 仓库以及建议项目名。
///
/// Code Logic（这个函数做什么）:
///     校验 path 非空后调用 `remote_path_info`，返回单个路径的元信息 DTO。
pub async fn remote_path_info(
    Json(req): Json<RemotePathReq>,
) -> Result<Json<WorkbenchRemotePathInfoDto>, AppError> {
    let path = validate_remote_path(req.path)?;
    Ok(Json(remote_directory::remote_path_info(Path::new(&path))?))
}

/// 在远端设备上打开一个本地项目记录。
///
/// Business Logic（为什么需要这个函数）:
///     本机选择远端目录后，需要让远端设备先创建或复用它自己的 Workbench 项目记录。
///
/// Code Logic（这个函数做什么）:
///     校验 path 非空，随后复用本机 add-project 共享实现，返回远端设备上的 local 项目 DTO。
pub async fn open_remote_project(
    State(state): State<AppState>,
    Json(req): Json<RemotePathReq>,
) -> Result<Json<WorkbenchProjectDto>, AppError> {
    let path = validate_remote_path(req.path)?;
    Ok(Json(
        add_local_workbench_project_from_path(&state, path).await?,
    ))
}

/// 列出远端设备本机项目的 worktree。
///
/// Business Logic（为什么需要这个函数）:
///     对端设备打开 remote shortcut 后，需要通过 HTTP 读取本设备上的 local project worktree 列表。
///
/// Code Logic（这个函数做什么）:
///     接收远端 local projectId，委托命令层本地 helper 返回 worktree DTO。
pub async fn list_worktrees(
    State(state): State<AppState>,
    Json(req): Json<RemoteProjectReq>,
) -> Result<Json<Vec<WorkbenchWorktreeDto>>, AppError> {
    ensure_remote_gateway_local_project_id(&state, &req.project_id).await?;
    Ok(Json(
        local_list_workbench_worktrees(&state, req.project_id).await?,
    ))
}

/// 在远端设备本机项目中创建 worktree。
///
/// Business Logic（为什么需要这个函数）:
///     用户在另一台设备上操作 remote shortcut 时，真实 `git worktree add` 应在项目所在设备执行。
///
/// Code Logic（这个函数做什么）:
///     接收 projectId/branchName/baseBranch，委托本地 create worktree helper 并返回 DTO。
pub async fn create_worktree(
    State(state): State<AppState>,
    Json(req): Json<RemoteCreateWorktreeReq>,
) -> Result<Json<WorkbenchWorktreeDto>, AppError> {
    ensure_remote_gateway_local_project_id(&state, &req.project_id).await?;
    Ok(Json(
        local_create_workbench_worktree(&state, req.project_id, req.branch_name, req.base_branch)
            .await?,
    ))
}

/// 列出远端设备本机项目的 Git 提交。
///
/// Business Logic（为什么需要这个函数）:
///     本机查看远端项目 Git 历史时，需要让远端设备在自己的 worktree 路径下执行 Git 查询。
///
/// Code Logic（这个函数做什么）:
///     接收 projectId/worktreeId/limit，委托本地 Git commits helper，limit 归一到 1..100。
pub async fn list_git_commits(
    State(state): State<AppState>,
    Json(req): Json<RemoteGitCommitsReq>,
) -> Result<Json<Vec<WorkbenchGitCommitDto>>, AppError> {
    ensure_remote_gateway_local_project_id(&state, &req.project_id).await?;
    let limit = Some(req.limit.clamp(1, 100) as usize);
    Ok(Json(
        local_list_workbench_git_commits(&state, req.project_id, req.worktree_id, limit).await?,
    ))
}

/// 列出远端设备本机项目目录。
///
/// Business Logic（为什么需要这个函数）:
///     remote shortcut 的文件树展开需要在项目所在设备上读取文件系统。
///
/// Code Logic（这个函数做什么）:
///     接收 projectId/worktreeId/path，委托本地 list_dir helper 返回文件节点。
pub async fn list_workbench_dir(
    State(state): State<AppState>,
    Json(req): Json<RemoteListDirReq>,
) -> Result<Json<Vec<WorkbenchFileNode>>, AppError> {
    ensure_remote_gateway_local_project_id(&state, &req.project_id).await?;
    Ok(Json(
        local_list_workbench_dir(&state, req.project_id, req.worktree_id, req.path).await?,
    ))
}

/// 查询远端设备本机项目内路径信息。
///
/// Business Logic（为什么需要这个函数）:
///     remote shortcut 的详情面板需要读取项目所在设备上的 metadata。
///
/// Code Logic（这个函数做什么）:
///     接收 projectId/worktreeId/path，委托本地 path_info helper 返回统一 DTO。
pub async fn workbench_path_info(
    State(state): State<AppState>,
    Json(req): Json<RemotePathInfoReq>,
) -> Result<Json<WorkbenchPathInfo>, AppError> {
    ensure_remote_gateway_local_project_id(&state, &req.project_id).await?;
    Ok(Json(
        local_get_workbench_path_info(&state, req.project_id, req.worktree_id, req.path).await?,
    ))
}

/// 打开远端设备本机项目内文件。
///
/// Business Logic（为什么需要这个函数）:
///     remote shortcut 打开文件时，文件类型检测和预览必须在项目所在设备上执行。
///
/// Code Logic（这个函数做什么）:
///     接收 projectId/worktreeId/path，委托本地 open-file helper 返回完整文件打开 DTO。
pub async fn open_workbench_file(
    State(state): State<AppState>,
    Json(req): Json<RemoteOpenFileReq>,
) -> Result<Json<WorkbenchOpenFileDto>, AppError> {
    ensure_remote_gateway_local_project_id(&state, &req.project_id).await?;
    Ok(Json(
        local_open_workbench_file(&state, req.project_id, req.worktree_id, req.path).await?,
    ))
}

/// 保存远端设备本机项目内文本文件。
///
/// Business Logic（为什么需要这个函数）:
///     remote shortcut 保存文件时，需要在项目所在设备上复用本地类型校验与原子保存。
///
/// Code Logic（这个函数做什么）:
///     接收 projectId/worktreeId/path/content/baseHash，委托本地 save-text helper。
pub async fn save_workbench_text_file(
    State(state): State<AppState>,
    Json(req): Json<RemoteSaveTextReq>,
) -> Result<Json<WorkbenchSaveTextResultDto>, AppError> {
    ensure_remote_gateway_local_project_id(&state, &req.project_id).await?;
    Ok(Json(
        local_save_workbench_text_file(
            &state,
            req.project_id,
            req.worktree_id,
            req.path,
            req.content,
            req.base_hash,
        )
        .await?,
    ))
}

/// 在远端设备本机项目内创建文件。
///
/// Business Logic（为什么需要这个函数）:
///     remote shortcut 新建文件时，真实磁盘写入必须发生在项目所在设备。
///
/// Code Logic（这个函数做什么）:
///     接收 projectId/worktreeId/parentPath/name，委托本地 create-file helper。
pub async fn create_workbench_file(
    State(state): State<AppState>,
    Json(req): Json<RemoteCreatePathReq>,
) -> Result<Json<WorkbenchPathInfo>, AppError> {
    ensure_remote_gateway_local_project_id(&state, &req.project_id).await?;
    Ok(Json(
        local_create_workbench_file(
            &state,
            req.project_id,
            req.worktree_id,
            req.parent_path,
            req.name,
        )
        .await?,
    ))
}

/// 在远端设备本机项目内创建目录。
///
/// Business Logic（为什么需要这个函数）:
///     remote shortcut 新建目录时，真实磁盘写入必须发生在项目所在设备。
///
/// Code Logic（这个函数做什么）:
///     接收 projectId/worktreeId/parentPath/name，委托本地 create-dir helper。
pub async fn create_workbench_dir(
    State(state): State<AppState>,
    Json(req): Json<RemoteCreatePathReq>,
) -> Result<Json<WorkbenchPathInfo>, AppError> {
    ensure_remote_gateway_local_project_id(&state, &req.project_id).await?;
    Ok(Json(
        local_create_workbench_dir(
            &state,
            req.project_id,
            req.worktree_id,
            req.parent_path,
            req.name,
        )
        .await?,
    ))
}

/// 重命名远端设备本机项目内路径。
///
/// Business Logic（为什么需要这个函数）:
///     remote shortcut 重命名文件/目录时，需要在项目所在设备上执行安全重命名。
///
/// Code Logic（这个函数做什么）:
///     接收 projectId/worktreeId/path/newName，委托本地 rename helper。
pub async fn rename_workbench_path(
    State(state): State<AppState>,
    Json(req): Json<RemoteRenamePathReq>,
) -> Result<Json<WorkbenchPathInfo>, AppError> {
    ensure_remote_gateway_local_project_id(&state, &req.project_id).await?;
    Ok(Json(
        local_rename_workbench_path(
            &state,
            req.project_id,
            req.worktree_id,
            req.path,
            req.new_name,
        )
        .await?,
    ))
}

/// 删除远端设备本机项目内路径。
///
/// Business Logic（为什么需要这个函数）:
///     remote shortcut 删除文件/目录时，需要在项目所在设备上执行安全删除。
///
/// Code Logic（这个函数做什么）:
///     接收 projectId/worktreeId/path，委托本地 delete helper 并返回 `{ok,path}`。
pub async fn delete_workbench_path(
    State(state): State<AppState>,
    Json(req): Json<RemoteDeletePathReq>,
) -> Result<Json<serde_json::Value>, AppError> {
    ensure_remote_gateway_local_project_id(&state, &req.project_id).await?;
    Ok(Json(
        local_delete_workbench_path(&state, req.project_id, req.worktree_id, req.path).await?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workbench::models::WorkbenchProjectRow;
    use crate::workbench::remote_protocol::{RemoteListDirReq, RemoteSaveTextReq};

    /// Business Logic（为什么需要这个函数）:
    ///     route guard 测试只关心项目 kind，不需要真实数据库项目。
    ///
    /// Code Logic（这个函数做什么）:
    ///     构造最小 WorkbenchProjectRow，并允许测试覆盖 kind 字段。
    fn project_row_with_kind(kind: &str) -> WorkbenchProjectRow {
        WorkbenchProjectRow {
            id: "project-1".to_string(),
            name: "Project".to_string(),
            kind: kind.to_string(),
            device_id: "local".to_string(),
            device_name: "Local".to_string(),
            path: "/tmp/project".to_string(),
            last_opened_at: "2026-01-01T00:00:00Z".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }

    /// Business Logic（为什么需要这个测试）:
    ///     远端目录浏览不能接受空路径，否则对端可能误读当前进程目录或返回不可预测结果。
    ///
    /// Code Logic（这个测试做什么）:
    ///     直接调用 list-dir handler，断言空白 path 在进入文件系统 helper 前被拒绝。
    #[tokio::test]
    async fn remote_list_dir_rejects_blank_path() {
        let error = remote_list_dir(Json(RemotePathReq {
            path: "   ".to_string(),
        }))
        .await
        .expect_err("blank path should be rejected");

        assert_eq!(error.to_string(), "路径不能为空");
    }

    /// Business Logic（为什么需要这个测试）:
    ///     远端路径详情与目录列表使用同一用户输入，空路径也必须一致拒绝。
    ///
    /// Code Logic（这个测试做什么）:
    ///     直接调用 path-info handler，断言空白 path 返回中文业务错误。
    #[tokio::test]
    async fn remote_path_info_rejects_blank_path() {
        let error = remote_path_info(Json(RemotePathReq {
            path: "\n\t".to_string(),
        }))
        .await
        .expect_err("blank path should be rejected");

        assert_eq!(error.to_string(), "路径不能为空");
    }

    /// Business Logic（为什么需要这个测试）:
    ///     远端文件保存路由是跨设备文件编辑的写入入口，请求体必须明确携带项目、worktree、路径、内容和 baseHash。
    ///
    /// Code Logic（这个测试做什么）:
    ///     用 camelCase JSON 反序列化 save-text 请求体，断言字段进入共享请求 DTO。
    #[test]
    fn remote_save_text_req_accepts_camel_case_body() {
        let req: RemoteSaveTextReq = serde_json::from_value(serde_json::json!({
            "projectId": "project-1",
            "worktreeId": "worktree-1",
            "path": "docs/note.md",
            "content": "# Note\n",
            "baseHash": "old-hash"
        }))
        .unwrap();

        assert_eq!(req.project_id, "project-1");
        assert_eq!(req.worktree_id.as_deref(), Some("worktree-1"));
        assert_eq!(req.base_hash, "old-hash");
    }

    /// Business Logic（为什么需要这个测试）:
    ///     远端文件树列表既支持项目根，也支持子目录；path 为空时应由命令 helper 解释为项目根。
    ///
    /// Code Logic（这个测试做什么）:
    ///     反序列化只有 projectId 的 list-dir 请求，断言可选 worktreeId/path 都保持 None。
    #[test]
    fn remote_list_dir_req_allows_project_root_without_worktree_or_path() {
        let req: RemoteListDirReq = serde_json::from_value(serde_json::json!({
            "projectId": "project-1"
        }))
        .unwrap();

        assert_eq!(req.project_id, "project-1");
        assert!(req.worktree_id.is_none());
        assert!(req.path.is_none());
    }

    /// Business Logic（为什么需要这个测试）:
    ///     Workbench P2P 网关协议只接受对端本机 local projectId，不能把 remote shortcut 再当成本机项目执行文件或 Git 操作。
    ///
    /// Code Logic（这个测试做什么）:
    ///     直接校验 route-level project kind guard：local 通过，remote 返回清晰协议错误。
    #[test]
    fn remote_gateway_project_guard_rejects_non_local_project() {
        assert!(ensure_remote_gateway_local_project(&project_row_with_kind("local")).is_ok());

        let error = ensure_remote_gateway_local_project(&project_row_with_kind("remote"))
            .expect_err("remote shortcut rows must be rejected by P2P route guard");

        assert_eq!(error.to_string(), "远端 Workbench 网关只接受对端本机项目");
    }
}
