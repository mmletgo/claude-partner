//! commands/workbench_dependencies.rs — 工作台运行时依赖命令
//!
//! Business Logic（为什么需要这个模块）:
//!     Workbench 页面和设置页需要通过 Tauri invoke 检测、安装、轮询和取消 tmux 依赖。
//!
//! Code Logic（这个模块做什么）:
//!     暴露 dependency manager 的四个 thin command，状态与任务句柄保存在 AppState。

use crate::error::AppError;
use crate::state::AppState;
use crate::workbench::dependencies::{
    actual_install_command_preview, probe_workbench_dependency, WorkbenchDependencyState,
    WorkbenchDependencyStatusDto,
};
use tauri::State;

/// 检测 Workbench tmux 依赖状态。
///
/// Business Logic（为什么需要这个函数）:
///     进入 Workbench 或设置页时，前端需要知道 tmux 是否可用以及缺失时可执行的安装命令预览。
///
/// Code Logic（这个函数做什么）:
///     运行后端探测并写入共享 dependency runtime；安装中则保留当前安装状态。
#[tauri::command]
pub async fn check_workbench_dependency(
    state: State<'_, AppState>,
) -> Result<WorkbenchDependencyStatusDto, AppError> {
    Ok(state
        .workbench_dependency
        .set_checked_status(probe_workbench_dependency()))
}

/// 启动 Workbench tmux 依赖安装。
///
/// Business Logic（为什么需要这个函数）:
///     用户确认安装后，后端负责执行平台安装命令并让前端轮询状态；不做静默 sudo 密码注入。
///
/// Code Logic（这个函数做什么）:
///     若 tmux 已可用直接返回 ready；否则按平台预览命令 spawn 后台任务。
#[tauri::command]
pub async fn install_workbench_dependency(
    state: State<'_, AppState>,
) -> Result<WorkbenchDependencyStatusDto, AppError> {
    let detected = probe_workbench_dependency();
    if detected.status == WorkbenchDependencyState::Ready {
        return Ok(state.workbench_dependency.set_checked_status(detected));
    }

    let command = actual_install_command_preview()
        .ok_or_else(|| AppError::generic("当前平台不支持自动安装 tmux"))?;
    state.workbench_dependency.spawn_install(command)
}

/// 读取 Workbench tmux 依赖安装状态。
///
/// Business Logic（为什么需要这个函数）:
///     安装命令可能运行较久，前端需要轮询当前状态和最近输出摘要。
///
/// Code Logic（这个函数做什么）:
///     返回 AppState 中 dependency runtime 的当前 DTO 快照。
#[tauri::command]
pub async fn get_workbench_dependency_install_status(
    state: State<'_, AppState>,
) -> Result<WorkbenchDependencyStatusDto, AppError> {
    Ok(state.workbench_dependency.status())
}

/// 取消正在进行的 Workbench tmux 依赖安装。
///
/// Business Logic（为什么需要这个函数）:
///     用户不想继续等待安装时，应能停止后台安装命令并看到取消状态。
///
/// Code Logic（这个函数做什么）:
///     触发 runtime 取消令牌并返回取消后的状态快照。
#[tauri::command]
pub async fn cancel_workbench_dependency_install(
    state: State<'_, AppState>,
) -> Result<WorkbenchDependencyStatusDto, AppError> {
    Ok(state.workbench_dependency.cancel())
}
