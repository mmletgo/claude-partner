# -*- coding: utf-8 -*-
"""设备数据模型：定义局域网中对端设备的数据结构。"""

from dataclasses import dataclass
from datetime import datetime


@dataclass
class Device:
    """
    设备数据实体，表示局域网中发现的一个对端设备。

    Business Logic（为什么需要这个类）:
        P2P 局域网协作需要跟踪每个对端设备的连接信息（IP、端口）和在线状态，
        以便进行文件传输和 Prompt 同步。

    Code Logic（这个类做什么）:
        封装设备的标识、网络地址和状态信息，提供构建 HTTP URL 的方法
        以及字典序列化/反序列化方法。
    """

    id: str  # UUID
    name: str  # 主机名或用户自定义
    host: str  # IP 地址
    port: int  # HTTP 端口
    last_seen: datetime
    online: bool = False

    def base_url(self) -> str:
        """
        Business Logic（为什么需要这个函数）:
            与对端设备通信时需要构造 HTTP 请求的 base URL。

        Code Logic（这个函数做什么）:
            根据设备的 host 和 port 拼接返回 "http://{host}:{port}" 格式的字符串。
        """
        return f"http://{self.host}:{self.port}"

    def to_dict(self) -> dict:
        """
        Business Logic（为什么需要这个函数）:
            设备信息需要在网络通信或状态持久化时转换为可序列化的字典。

        Code Logic（这个函数做什么）:
            将 Device 实例序列化为字典，datetime 转为 ISO 格式字符串。
        """
        return {
            "id": self.id,
            "name": self.name,
            "host": self.host,
            "port": self.port,
            "last_seen": self.last_seen.isoformat(),
            "online": self.online,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Device":
        """
        Business Logic（为什么需要这个函数）:
            从网络接收到的数据中还原 Device 实例。

        Code Logic（这个函数做什么）:
            从字典反序列化为 Device 实例，ISO 格式字符串转为 datetime 对象。
        """
        return cls(
            id=data["id"],
            name=data["name"],
            host=data["host"],
            port=data["port"],
            last_seen=datetime.fromisoformat(data["last_seen"]),
            online=data.get("online", False),
        )
