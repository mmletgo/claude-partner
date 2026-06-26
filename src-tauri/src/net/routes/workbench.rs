//! net/routes/workbench.rs — Workbench 远端 HTTP 路由
//!
//! Business Logic（为什么需要这个模块）:
//!     局域网设备需要通过现有 P2P HTTP server 暴露 Workbench 远端目录浏览与项目打开能力。
//!
//! Code Logic（这个模块做什么）:
//!     将远端目录 helper 和本机项目添加逻辑包装为 axum handler，供其他设备调用。

use crate::commands::workbench::add_local_workbench_project_from_path;
use crate::error::AppError;
use crate::state::AppState;
use crate::workbench::models::{
    WorkbenchProjectDto, WorkbenchRemoteDirectoryEntryDto, WorkbenchRemotePathInfoDto,
    WorkbenchRemoteRootDto,
};
use crate::workbench::remote_directory;
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
