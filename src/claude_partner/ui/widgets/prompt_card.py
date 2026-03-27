# -*- coding: utf-8 -*-
"""Prompt 卡片组件：在列表中展示单条 Prompt 的摘要信息和操作按钮。"""

from PyQt6.QtWidgets import (
    QFrame,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QWidget,
    QSizePolicy,
)
from PyQt6.QtCore import pyqtSignal, Qt
from PyQt6.QtGui import QCursor

from claude_partner.models.prompt import Prompt


class PromptCard(QFrame):
    """
    Prompt 列表卡片：展示标题、内容预览、标签和操作按钮。

    Business Logic（为什么需要这个类）:
        Prompt 列表页需要以卡片形式直观展示每条 Prompt 的关键信息，
        提供复制、编辑、删除等快捷操作入口。

    Code Logic（这个类做什么）:
        使用 QFrame 作为容器，垂直布局依次排列：标题、内容预览、
        标签行、操作按钮行。通过 QSS 设置圆角边框和 hover 高亮效果。
    """

    copy_clicked: pyqtSignal = pyqtSignal(str)
    edit_clicked: pyqtSignal = pyqtSignal(str)
    delete_clicked: pyqtSignal = pyqtSignal(str)

    # 内容预览最大字符数
    _PREVIEW_MAX_CHARS: int = 100

    def __init__(self, prompt: Prompt, parent: QWidget | None = None) -> None:
        """
        Business Logic（为什么需要这个函数）:
            根据传入的 Prompt 数据构建卡片的完整 UI。

        Code Logic（这个函数做什么）:
            保存 prompt_id，创建标题标签、内容预览标签、标签展示行、
            更新时间标签和操作按钮行，设置 QSS 样式。
        """
        super().__init__(parent)
        self._prompt_id: str = prompt.id

        self.setFrameShape(QFrame.Shape.StyledPanel)
        self.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        self.setStyleSheet(
            """
            PromptCard {
                border: 1px solid #ddd;
                border-radius: 8px;
                padding: 12px;
                background: white;
            }
            PromptCard:hover {
                background: #f5f5f5;
            }
            """
        )

        main_layout: QVBoxLayout = QVBoxLayout(self)
        main_layout.setContentsMargins(12, 10, 12, 10)
        main_layout.setSpacing(6)

        # 标题行：标题 + 更新时间
        header_layout: QHBoxLayout = QHBoxLayout()
        title_label: QLabel = QLabel(prompt.title or "无标题")
        title_label.setStyleSheet(
            "font-size: 15px; font-weight: bold; color: #212121; background: transparent; border: none;"
        )
        title_label.setWordWrap(True)
        header_layout.addWidget(title_label, stretch=1)

        time_label: QLabel = QLabel(prompt.updated_at.strftime("%Y-%m-%d %H:%M"))
        time_label.setStyleSheet(
            "font-size: 11px; color: #999; background: transparent; border: none;"
        )
        time_label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        header_layout.addWidget(time_label)

        main_layout.addLayout(header_layout)

        # 内容预览
        preview_text: str = prompt.content[:self._PREVIEW_MAX_CHARS]
        if len(prompt.content) > self._PREVIEW_MAX_CHARS:
            preview_text += "..."
        content_label: QLabel = QLabel(preview_text)
        content_label.setStyleSheet(
            "font-size: 13px; color: #555; background: transparent; border: none;"
        )
        content_label.setWordWrap(True)
        main_layout.addWidget(content_label)

        # 标签行
        if prompt.tags:
            tags_layout: QHBoxLayout = QHBoxLayout()
            tags_layout.setSpacing(4)
            tags_layout.setContentsMargins(0, 2, 0, 2)

            # 预设标签颜色列表（与 tag_widget 一致）
            tag_colors: list[tuple[str, str]] = [
                ("#E3F2FD", "#1565C0"),
                ("#E8F5E9", "#2E7D32"),
                ("#FFF3E0", "#E65100"),
                ("#F3E5F5", "#7B1FA2"),
                ("#E0F7FA", "#00695C"),
                ("#FBE9E7", "#BF360C"),
                ("#EDE7F6", "#4527A0"),
                ("#E1F5FE", "#01579B"),
            ]

            for i, tag in enumerate(prompt.tags):
                bg, fg = tag_colors[i % len(tag_colors)]
                tag_label: QLabel = QLabel(tag)
                tag_label.setStyleSheet(
                    f"""
                    background-color: {bg};
                    color: {fg};
                    border-radius: 8px;
                    padding: 2px 8px;
                    font-size: 11px;
                    border: none;
                    """
                )
                tags_layout.addWidget(tag_label)
            tags_layout.addStretch()
            main_layout.addLayout(tags_layout)

        # 操作按钮行
        btn_layout: QHBoxLayout = QHBoxLayout()
        btn_layout.setContentsMargins(0, 4, 0, 0)
        btn_layout.addStretch()

        btn_style: str = """
            QPushButton {
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 4px 12px;
                font-size: 12px;
                background: white;
                color: #333;
            }
            QPushButton:hover {
                background: #e3f2fd;
                border-color: #0078D4;
                color: #0078D4;
            }
        """

        btn_copy: QPushButton = QPushButton("复制")
        btn_copy.setStyleSheet(btn_style)
        btn_copy.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_copy.clicked.connect(lambda: self.copy_clicked.emit(self._prompt_id))
        btn_layout.addWidget(btn_copy)

        btn_edit: QPushButton = QPushButton("编辑")
        btn_edit.setStyleSheet(btn_style)
        btn_edit.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_edit.clicked.connect(lambda: self.edit_clicked.emit(self._prompt_id))
        btn_layout.addWidget(btn_edit)

        btn_delete: QPushButton = QPushButton("删除")
        btn_delete.setStyleSheet(
            """
            QPushButton {
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 4px 12px;
                font-size: 12px;
                background: white;
                color: #D32F2F;
            }
            QPushButton:hover {
                background: #FFEBEE;
                border-color: #D32F2F;
            }
            """
        )
        btn_delete.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_delete.clicked.connect(lambda: self.delete_clicked.emit(self._prompt_id))
        btn_layout.addWidget(btn_delete)

        main_layout.addLayout(btn_layout)

    def mousePressEvent(self, event) -> None:  # type: ignore[override]
        """
        Business Logic（为什么需要这个函数）:
            用户点击卡片空白区域时应触发编辑操作。

        Code Logic（这个函数做什么）:
            在鼠标按下事件中发射 edit_clicked 信号。
        """
        if event.button() == Qt.MouseButton.LeftButton:
            self.edit_clicked.emit(self._prompt_id)
        super().mousePressEvent(event)

    @property
    def prompt_id(self) -> str:
        """
        Business Logic（为什么需要这个函数）:
            外部需要获取此卡片对应的 Prompt ID。

        Code Logic（这个函数做什么）:
            返回 prompt_id 字符串。
        """
        return self._prompt_id
