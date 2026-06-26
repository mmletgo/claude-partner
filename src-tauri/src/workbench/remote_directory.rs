//! workbench/remote_directory.rs — Workbench 远端目录浏览辅助
//!
//! Business Logic（为什么需要这个模块）:
//!     用户从局域网设备添加远端项目时，需要在对端设备上浏览目录并识别可打开的项目文件夹。
//!
//! Code Logic（这个模块做什么）:
//!     提供远端根目录、目录列表、路径信息和 Git 仓库检测的纯文件系统 helper。

#![allow(dead_code)]

use crate::error::AppError;
use crate::workbench::models::{
    WorkbenchRemoteDirectoryEntryDto, WorkbenchRemotePathInfoDto, WorkbenchRemoteRootDto,
};
use crate::workbench::projects::infer_project_name;
use chrono::{DateTime, Utc};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Business Logic（为什么需要这个函数）:
///     远端目录浏览和路径详情都需要向前端展示可读的修改时间。
///
/// Code Logic（这个函数做什么）:
///     从 metadata.modified() 读取系统时间，并转换成 UTC RFC3339 字符串；平台不支持时返回 None。
fn modified_at(metadata: &fs::Metadata) -> Option<String> {
    metadata.modified().ok().map(|time| {
        let datetime: DateTime<Utc> = time.into();
        datetime.to_rfc3339()
    })
}

/// Business Logic（为什么需要这个函数）:
///     目录选择器需要标记一个目录是否已经是 Git 仓库，帮助用户判断能否直接作为项目打开。
///
/// Code Logic（这个函数做什么）:
///     仅对目录检查其下 `.git` 路径是否存在，普通文件直接返回 false。
fn is_git_repo(path: &Path, is_dir: bool) -> bool {
    is_dir && path.join(".git").exists()
}

/// Business Logic（为什么需要这个函数）:
///     根目录列表可能由多个来源生成同一路径，需要去重以免前端显示重复入口。
///
/// Code Logic（这个函数做什么）:
///     检查路径是目录后按显示字符串去重，并追加为远端根目录 DTO。
fn push_root(
    roots: &mut Vec<WorkbenchRemoteRootDto>,
    seen: &mut HashSet<String>,
    label: impl Into<String>,
    path: PathBuf,
) {
    if !path.is_dir() {
        return;
    }
    let path_text = path.display().to_string();
    if seen.insert(path_text.clone()) {
        roots.push(WorkbenchRemoteRootDto {
            label: label.into(),
            path: path_text,
            kind: "dir".to_string(),
        });
    }
}

/// Business Logic（为什么需要这个函数）:
///     Windows 远端设备可能有多个可浏览盘符，根目录选择器应暴露存在的盘符入口。
///
/// Code Logic（这个函数做什么）:
///     在 Windows 上扫描 A-Z 盘符并追加存在的根路径；其他平台为空实现。
#[cfg(windows)]
fn push_platform_roots(roots: &mut Vec<WorkbenchRemoteRootDto>, seen: &mut HashSet<String>) {
    for letter in b'A'..=b'Z' {
        let drive = format!("{}:\\", letter as char);
        push_root(roots, seen, drive.clone(), PathBuf::from(drive));
    }
}

/// Business Logic（为什么需要这个函数）:
///     Unix 远端设备使用单一文件系统根，目录选择器需要提供从根目录开始浏览的入口。
///
/// Code Logic（这个函数做什么）:
///     在非 Windows 平台追加 `/` 根路径。
#[cfg(not(windows))]
fn push_platform_roots(roots: &mut Vec<WorkbenchRemoteRootDto>, seen: &mut HashSet<String>) {
    push_root(roots, seen, "文件系统", PathBuf::from("/"));
}

/// Business Logic（为什么需要这个函数）:
///     常用代码目录通常位于用户 home 下，远端项目选择器应把它们作为快捷入口。
///
/// Code Logic（这个函数做什么）:
///     为 home 目录下的 `web_project`、`projects`、`workspace` 追加存在的目录入口。
fn push_common_code_roots(
    roots: &mut Vec<WorkbenchRemoteRootDto>,
    seen: &mut HashSet<String>,
    home: &Path,
) {
    for name in ["web_project", "projects", "workspace"] {
        push_root(roots, seen, name, home.join(name));
    }
}

/// Business Logic（为什么需要这个函数）:
///     远端目录浏览需要把标准库 DirEntry 转成稳定的前端目录条目。
///
/// Code Logic（这个函数做什么）:
///     读取 metadata、名称、路径、类型、修改时间和 Git 仓库标识，生成 camelCase DTO。
fn entry_from_path(path: &Path) -> Result<WorkbenchRemoteDirectoryEntryDto, AppError> {
    let metadata = fs::metadata(path)?;
    let is_dir = metadata.is_dir();
    Ok(WorkbenchRemoteDirectoryEntryDto {
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_string(),
        path: path.display().to_string(),
        kind: if is_dir { "dir" } else { "file" }.to_string(),
        modified_at: modified_at(&metadata),
        is_git_repo: is_git_repo(path, is_dir),
    })
}

/// Business Logic（为什么需要这个函数）:
///     远端目录列表在不同平台和文件系统上应保持稳定顺序，避免前端列表抖动。
///
/// Code Logic（这个函数做什么）:
///     先目录后文件；同类型先按小写名称升序，小写相等时按原始名称升序。
fn sort_entries(entries: &mut [WorkbenchRemoteDirectoryEntryDto]) {
    entries.sort_by(|a, b| match (a.kind.as_str(), b.kind.as_str()) {
        ("dir", "file") => std::cmp::Ordering::Less,
        ("file", "dir") => std::cmp::Ordering::Greater,
        _ => a
            .name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.name.cmp(&b.name)),
    });
}

/// Business Logic（为什么需要这个函数）:
///     远端目录选择器需要展示对端设备的常用入口，减少用户手动输入路径的成本。
///
/// Code Logic（这个函数做什么）:
///     返回当前平台存在的根目录和常用代码目录。
pub fn remote_roots() -> Vec<WorkbenchRemoteRootDto> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();

    if let Some(home) = dirs::home_dir() {
        push_root(&mut roots, &mut seen, "Home", home.clone());
        if let Some(desktop) = dirs::desktop_dir() {
            push_root(&mut roots, &mut seen, "Desktop", desktop);
        }
        if let Some(documents) = dirs::document_dir() {
            push_root(&mut roots, &mut seen, "Documents", documents);
        }
        if let Some(downloads) = dirs::download_dir() {
            push_root(&mut roots, &mut seen, "Downloads", downloads);
        }
        push_common_code_roots(&mut roots, &mut seen, &home);
    }
    push_platform_roots(&mut roots, &mut seen);

    roots
}

/// Business Logic（为什么需要这个函数）:
///     用户浏览远端设备目录时，需要看到当前目录下的一级文件夹和文件。
///
/// Code Logic（这个函数做什么）:
///     读取指定路径的一级子项并返回远端目录条目 DTO。
pub fn list_remote_directory(
    path: &Path,
) -> Result<Vec<WorkbenchRemoteDirectoryEntryDto>, AppError> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_dir() {
        return Err(AppError::generic("路径必须是文件夹"));
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        entries.push(entry_from_path(&entry.path())?);
    }
    sort_entries(&mut entries);
    Ok(entries)
}

/// Business Logic（为什么需要这个函数）:
///     用户选中远端路径后，需要确认该路径是否可读、是否是 Git 仓库以及建议项目名称。
///
/// Code Logic（这个函数做什么）:
///     读取指定路径 metadata 并返回远端路径信息 DTO。
pub fn remote_path_info(path: &Path) -> Result<WorkbenchRemotePathInfoDto, AppError> {
    let metadata = fs::metadata(path)?;
    let is_dir = metadata.is_dir();
    let suggested_project_name = infer_project_name(path);
    let readable = if is_dir {
        fs::read_dir(path).is_ok()
    } else {
        fs::File::open(path).is_ok()
    };

    Ok(WorkbenchRemotePathInfoDto {
        name: suggested_project_name.clone(),
        path: path.display().to_string(),
        kind: if is_dir { "dir" } else { "file" }.to_string(),
        readable,
        is_git_repo: is_git_repo(path, is_dir),
        suggested_project_name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Business Logic（为什么需要这个测试）:
    ///     远端项目选择器需要识别目录是否已经是 Git 仓库，以便前端提示可直接打开为项目。
    ///
    /// Code Logic（这个测试做什么）:
    ///     在临时目录创建 `.git` 子目录，断言路径信息返回目录类型并标记为 Git 仓库。
    #[test]
    fn path_info_marks_git_repo() {
        let temp = TempDir::new().unwrap();
        fs::create_dir(temp.path().join(".git")).unwrap();

        let info = remote_path_info(temp.path()).unwrap();

        assert_eq!(info.kind, "dir");
        assert!(info.is_git_repo);
    }

    /// Business Logic（为什么需要这个测试）:
    ///     远端目录浏览应优先展示文件夹，帮助用户逐层进入项目路径。
    ///
    /// Code Logic（这个测试做什么）:
    ///     创建一个目录和一个文件，断言列表排序为目录在前、文件在后。
    #[test]
    fn list_directory_sorts_dirs_before_files() {
        let temp = TempDir::new().unwrap();
        fs::create_dir(temp.path().join("src")).unwrap();
        fs::write(temp.path().join("README.md"), "# Readme").unwrap();

        let entries = list_remote_directory(temp.path()).unwrap();

        assert_eq!(entries[0].name, "src");
        assert_eq!(entries[0].kind, "dir");
        assert_eq!(entries[1].name, "README.md");
    }
}
