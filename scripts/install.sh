#!/usr/bin/env bash
# Claude Partner Linux 安装脚本
# 用法: sudo bash install.sh

set -e

INSTALL_DIR="/opt/claude-partner"
DESKTOP_DIR="/usr/share/applications"
ICON_SIZES=(16 32 48 64 128 256)

echo "正在安装 Claude Partner..."

# 创建安装目录
mkdir -p "$INSTALL_DIR"

# 复制文件
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/ClaudePartner" "$INSTALL_DIR/ClaudePartner"
chmod 755 "$INSTALL_DIR/ClaudePartner"
cp "$SCRIPT_DIR/icon.png" "$INSTALL_DIR/icon.png"

# 安装 .desktop 文件
mkdir -p "$DESKTOP_DIR"
cp "$SCRIPT_DIR/claude-partner.desktop" "$DESKTOP_DIR/claude-partner.desktop"
chmod 644 "$DESKTOP_DIR/claude-partner.desktop"

# 安装图标到 hicolor 主题（让桌面环境自动识别）
HICOLOR_DIR="/usr/share/icons/hicolor"
for size in "${ICON_SIZES[@]}"; do
    icon_dir="$HICOLOR_DIR/${size}x${size}/apps"
    mkdir -p "$icon_dir"
    cp "$SCRIPT_DIR/icon.png" "$icon_dir/claude-partner.png"
done

# 更新图标缓存
if command -v gtk-update-icon-cache &>/dev/null; then
    gtk-update-icon-cache -f "$HICOLOR_DIR" 2>/dev/null || true
fi

# 更新桌面数据库
if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

echo "安装完成！可从应用菜单启动 Claude Partner。"
echo "安装位置: $INSTALL_DIR/ClaudePartner"
