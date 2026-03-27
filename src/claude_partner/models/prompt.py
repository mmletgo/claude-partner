# -*- coding: utf-8 -*-
"""Prompt 数据模型：定义 Prompt 的数据结构和序列化方法。"""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Prompt:
    """
    Prompt 数据实体，表示一条可同步的文本记录。

    Business Logic（为什么需要这个类）:
        用户需要管理常用的 Prompt 文本，支持标签分类、跨设备同步和软删除，
        因此需要一个完整的数据模型来承载这些信息。

    Code Logic（这个类做什么）:
        封装 Prompt 的所有字段，包括用于 CRDT 同步的向量时钟。
        提供字典序列化/反序列化方法，以便在数据库和网络传输中使用。
    """

    id: str  # UUID
    title: str
    content: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    device_id: str  # 创建设备 ID
    vector_clock: dict[str, int]  # {device_id: counter}
    deleted: bool = False

    def to_dict(self) -> dict:
        """
        Business Logic（为什么需要这个函数）:
            Prompt 需要在数据库存储和网络传输时转换为可 JSON 序列化的字典。

        Code Logic（这个函数做什么）:
            将 Prompt 实例序列化为字典，datetime 转为 ISO 格式字符串，其他字段原样输出。
        """
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "tags": self.tags,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "device_id": self.device_id,
            "vector_clock": self.vector_clock,
            "deleted": self.deleted,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Prompt":
        """
        Business Logic（为什么需要这个函数）:
            从数据库查询结果或网络接收到的数据中还原 Prompt 实例。

        Code Logic（这个函数做什么）:
            从字典反序列化为 Prompt 实例，ISO 格式字符串转为 datetime 对象。
        """
        return cls(
            id=data["id"],
            title=data["title"],
            content=data["content"],
            tags=data["tags"] if isinstance(data["tags"], list) else data["tags"],
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            device_id=data["device_id"],
            vector_clock=data["vector_clock"] if isinstance(data["vector_clock"], dict) else data["vector_clock"],
            deleted=bool(data.get("deleted", False)),
        )

    def copy_content(self) -> str:
        """
        Business Logic（为什么需要这个函数）:
            用户经常需要复制 Prompt 内容到剪贴板直接粘贴使用。

        Code Logic（这个函数做什么）:
            返回 content 字段的文本内容，供 UI 层复制到剪贴板。
        """
        return self.content
