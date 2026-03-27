# -*- coding: utf-8 -*-
"""截图管理器模块：协调截图流程，管理覆盖层生命周期。"""

from __future__ import annotations

from PyQt6.QtCore import QObject, pyqtSignal
from PyQt6.QtGui import QGuiApplication, QPixmap

from claude_partner.screenshot.overlay import ScreenshotOverlay


class ScreenshotManager(QObject):
    """
    截图功能管理器，协调截图流程。

    Business Logic（为什么需要这个类）:
        截图功能涉及覆盖层的创建、截图完成后复制到剪贴板、
        以及覆盖层的清理，需要一个管理器统一协调这些步骤。

    Code Logic（这个类做什么）:
        创建和管理 ScreenshotOverlay 实例，连接其信号，
        截图完成后自动复制到系统剪贴板并发射 screenshot_ready 信号，
        取消或完成后清理覆盖层资源。
    """

    screenshot_ready = pyqtSignal(QPixmap)

    def __init__(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            管理器初始化时不创建覆盖层，等用户触发截图时再创建。

        Code Logic（这个函数做什么）:
            初始化 overlay 引用为 None。
        """
        super().__init__()
        self._overlay: ScreenshotOverlay | None = None

    def take_screenshot(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            用户点击截图按钮或使用快捷键时触发区域截图流程。

        Code Logic（这个函数做什么）:
            创建 ScreenshotOverlay 实例，连接完成和取消信号，
            然后调用 start() 开始截图。
        """
        self._overlay = ScreenshotOverlay()
        self._overlay.screenshot_taken.connect(self._on_screenshot_taken)
        self._overlay.screenshot_cancelled.connect(self._on_cancelled)
        self._overlay.start()

    def _on_screenshot_taken(self, pixmap: QPixmap) -> None:
        """
        Business Logic（为什么需要这个函数）:
            截图完成后需要复制到剪贴板以便用户直接粘贴使用，
            同时通知其他模块截图已就绪。

        Code Logic（这个函数做什么）:
            将截图 pixmap 复制到系统剪贴板，发射 screenshot_ready 信号，
            然后清理覆盖层。
        """
        clipboard = QGuiApplication.clipboard()
        if clipboard:
            clipboard.setPixmap(pixmap)
        self.screenshot_ready.emit(pixmap)
        self._cleanup()

    def _on_cancelled(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            用户取消截图时需要清理覆盖层资源。

        Code Logic（这个函数做什么）:
            调用 _cleanup 释放覆盖层。
        """
        self._cleanup()

    def _cleanup(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            截图流程结束后需要释放覆盖层占用的内存和系统资源。

        Code Logic（这个函数做什么）:
            调用 deleteLater 安全地在 Qt 事件循环中销毁覆盖层对象，
            并将引用置为 None。
        """
        if self._overlay:
            self._overlay.deleteLater()
            self._overlay = None
