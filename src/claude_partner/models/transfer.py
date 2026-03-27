# -*- coding: utf-8 -*-
"""文件传输数据模型：定义传输任务的状态、方向和数据结构。"""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
import math


class TransferStatus(Enum):
    """
    传输任务状态枚举。

    Business Logic（为什么需要这个类）:
        文件传输是一个多阶段过程，需要精确跟踪每个任务当前所处的状态，
        以便 UI 展示和断点续传逻辑判断。

    Code Logic（这个类做什么）:
        定义传输任务的五种状态：等待中、传输中、已完成、失败、已取消。
    """

    PENDING = "pending"
    TRANSFERRING = "transferring"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TransferDirection(Enum):
    """
    传输方向枚举。

    Business Logic（为什么需要这个类）:
        需要区分文件是从本机发送给对端还是从对端接收，
        以便 UI 展示和存储路径逻辑区分。

    Code Logic（这个类做什么）:
        定义两种传输方向：发送和接收。
    """

    SEND = "send"
    RECEIVE = "receive"


@dataclass
class TransferTask:
    """
    文件传输任务数据实体。

    Business Logic（为什么需要这个类）:
        文件传输需要跟踪文件元数据（名称、大小、哈希）、传输进度、
        对端信息和任务状态，以支持断点续传和传输历史查看。

    Code Logic（这个类做什么）:
        封装单次文件传输的所有信息，包括分块参数、进度计算、
        字典序列化/反序列化方法。
    """

    id: str  # UUID
    filename: str
    file_path: str  # 本地文件路径
    size: int  # 文件总大小(bytes)
    sha256: str  # 文件 SHA256
    chunk_size: int  # 块大小，默认 1MB = 1048576
    direction: TransferDirection
    peer_device_id: str  # 对端设备 ID
    status: TransferStatus
    transferred_bytes: int
    created_at: datetime
    completed_at: datetime | None = None

    def progress(self) -> float:
        """
        Business Logic（为什么需要这个函数）:
            UI 需要显示传输进度百分比，让用户了解传输完成情况。

        Code Logic（这个函数做什么）:
            返回 0.0 ~ 1.0 之间的进度值。size 为 0 时返回 0.0 避免除零错误。
        """
        if self.size == 0:
            return 0.0
        return self.transferred_bytes / self.size

    def total_chunks(self) -> int:
        """
        Business Logic（为什么需要这个函数）:
            分块传输协议需要知道总块数来调度传输和判断是否完成。

        Code Logic（这个函数做什么）:
            向上取整计算总块数：ceil(size / chunk_size)。size 为 0 时返回 0。
        """
        if self.size == 0:
            return 0
        return math.ceil(self.size / self.chunk_size)

    def to_dict(self) -> dict:
        """
        Business Logic（为什么需要这个函数）:
            传输任务信息需要写入数据库历史记录或在网络通信中传递。

        Code Logic（这个函数做什么）:
            将 TransferTask 实例序列化为字典。枚举用 .value，
            datetime 用 ISO 格式字符串，None 保持为 None。
        """
        return {
            "id": self.id,
            "filename": self.filename,
            "file_path": self.file_path,
            "size": self.size,
            "sha256": self.sha256,
            "chunk_size": self.chunk_size,
            "direction": self.direction.value,
            "peer_device_id": self.peer_device_id,
            "status": self.status.value,
            "transferred_bytes": self.transferred_bytes,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "TransferTask":
        """
        Business Logic（为什么需要这个函数）:
            从数据库查询结果或网络数据中还原 TransferTask 实例。

        Code Logic（这个函数做什么）:
            从字典反序列化为 TransferTask 实例。字符串还原为枚举和 datetime 对象。
        """
        completed_at: datetime | None = None
        if data.get("completed_at"):
            completed_at = datetime.fromisoformat(data["completed_at"])

        return cls(
            id=data["id"],
            filename=data["filename"],
            file_path=data["file_path"],
            size=data["size"],
            sha256=data["sha256"],
            chunk_size=data.get("chunk_size", 1048576),
            direction=TransferDirection(data["direction"]),
            peer_device_id=data["peer_device_id"],
            status=TransferStatus(data["status"]),
            transferred_bytes=data.get("transferred_bytes", 0),
            created_at=datetime.fromisoformat(data["created_at"]),
            completed_at=completed_at,
        )
