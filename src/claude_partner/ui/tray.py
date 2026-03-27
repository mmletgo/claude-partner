# -*- coding: utf-8 -*-
"""系统托盘模块：提供系统托盘图标、右键菜单和常用操作入口。"""

from __future__ import annotations

from PyQt6.QtWidgets import QSystemTrayIcon, QMenu, QApplication
from PyQt6.QtGui import QIcon, QPixmap, QPainter, QColor, QFont, QAction
from PyQt6.QtCore import pyqtSignal, Qt


class SystemTray(QSystemTrayIcon):
    """
    系统托盘图标，提供快捷操作入口。

    Business Logic（为什么需要这个类）:
        用户最小化窗口后需要通过系统托盘快速访问常用功能（显示窗口、截图、退出），
        同时托盘图标的提示文字需要展示在线设备数量，让用户无需打开窗口即可
        了解网络协作状态。

    Code Logic（这个类做什么）:
        代码绘制一个蓝色圆形带 "CP" 文字的图标（不依赖外部文件），
        设置右键菜单包含显示窗口、截图和退出三个选项，
        双击托盘图标时发射 show_window_requested 信号。
    """

    show_window_requested: pyqtSignal = pyqtSignal()
    screenshot_requested: pyqtSignal = pyqtSignal()
    quit_requested: pyqtSignal = pyqtSignal()

    def __init__(self, parent: QApplication | None = None) -> None:
        """
        Business Logic（为什么需要这个函数）:
            初始化系统托盘，设置图标、菜单和双击行为。

        Code Logic（这个函数做什么）:
            创建代码绘制的图标，设置右键菜单，连接 activated 信号
            以处理双击事件，设置默认提示文字。
        """
        super().__init__(parent)
        self.setIcon(self._create_icon())
        self.setToolTip("Claude Partner - 0 个设备在线")
        self._setup_menu()
        self.activated.connect(self._on_activated)

    def _create_icon(self) -> QIcon:
        """
        Business Logic（为什么需要这个函数）:
            托盘需要一个应用图标，使用代码绘制可以避免依赖外部图标文件，
            确保在任何环境下都能正常显示。

        Code Logic（这个函数做什么）:
            创建 64x64 的 QPixmap，用 QPainter 绘制蓝色(#0078D4)圆形背景，
            在圆形中心绘制白色 "CP" 文字，返回 QIcon。
        """
        size: int = 64
        pixmap: QPixmap = QPixmap(size, size)
        pixmap.fill(QColor(0, 0, 0, 0))  # 透明背景

        painter: QPainter = QPainter(pixmap)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)

        # 绘制蓝色圆形背景
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor("#0078D4"))
        painter.drawEllipse(2, 2, size - 4, size - 4)

        # 绘制白色 "CP" 文字
        painter.setPen(QColor("white"))
        font: QFont = QFont("Arial", 20, QFont.Weight.Bold)
        painter.setFont(font)
        painter.drawText(
            pixmap.rect(),
            Qt.AlignmentFlag.AlignCenter,
            "CP",
        )

        painter.end()
        return QIcon(pixmap)

    def _setup_menu(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            用户右键点击托盘图标时需要弹出菜单，提供常用操作入口。

        Code Logic（这个函数做什么）:
            创建 QMenu 并添加三个菜单项：显示主窗口、截图、退出。
            截图和退出之间添加分隔线。每个菜单项连接到对应的信号。
        """
        menu: QMenu = QMenu()

        show_action: QAction = QAction("显示主窗口", menu)
        show_action.triggered.connect(self.show_window_requested.emit)
        menu.addAction(show_action)

        screenshot_action: QAction = QAction("截图", menu)
        screenshot_action.triggered.connect(self.screenshot_requested.emit)
        menu.addAction(screenshot_action)

        menu.addSeparator()

        quit_action: QAction = QAction("退出", menu)
        quit_action.triggered.connect(self.quit_requested.emit)
        menu.addAction(quit_action)

        self.setContextMenu(menu)

    def _on_activated(self, reason: QSystemTrayIcon.ActivationReason) -> None:
        """
        Business Logic（为什么需要这个函数）:
            用户双击托盘图标时期望打开/显示主窗口。

        Code Logic（这个函数做什么）:
            判断激活原因是否为双击，是则发射 show_window_requested 信号。
        """
        if reason == QSystemTrayIcon.ActivationReason.DoubleClick:
            self.show_window_requested.emit()

    def update_device_count(self, count: int) -> None:
        """
        Business Logic（为什么需要这个函数）:
            设备数量变化时需要更新托盘提示文字，让用户鼠标悬停在托盘图标上时
            即可看到当前在线设备数量。

        Code Logic（这个函数做什么）:
            更新 toolTip 为包含设备数量的中文提示文字。
        """
        self.setToolTip(f"Claude Partner - {count} 个设备在线")
