# -*- coding: utf-8 -*-
"""mDNS 设备发现模块：通过 zeroconf 在局域网自动发现和注册设备。"""

from zeroconf import Zeroconf, ServiceBrowser, ServiceInfo, ServiceStateChange
from PyQt6.QtCore import QObject, pyqtSignal
from claude_partner.models.device import Device
from claude_partner.config import AppConfig
import asyncio
import socket
import logging
from datetime import datetime

logger: logging.Logger = logging.getLogger(__name__)

SERVICE_TYPE: str = "_claude-partner._tcp.local."


class DeviceDiscovery(QObject):
    """
    mDNS 服务注册和发现，管理局域网中对端设备的生命周期。

    Business Logic（为什么需要这个类）:
        P2P 局域网协作需要自动发现同一网络中的其他 Claude Partner 实例，
        无需用户手动输入 IP 地址和端口。通过 mDNS 协议实现零配置网络发现。

    Code Logic（这个类做什么）:
        1. 将本机注册为 mDNS 服务，广播自身的 device_id、device_name 和 HTTP 端口
        2. 浏览同类型的 mDNS 服务，发现其他设备上线/下线
        3. 维护 _devices 字典跟踪在线设备，通过 Qt 信号通知 UI 层
        注意：zeroconf 回调在后台线程执行，Qt 信号机制自动处理跨线程分发
    """

    device_found = pyqtSignal(object)  # 发现新设备，传 Device 对象
    device_lost = pyqtSignal(str)  # 设备离线，传 device_id

    def __init__(self, config: AppConfig) -> None:
        """
        Business Logic（为什么需要这个函数）:
            初始化设备发现服务，需要配置中的设备 ID 和名称来注册本机服务。

        Code Logic（这个函数做什么）:
            保存配置引用，初始化内部状态（设备字典、zeroconf 实例占位符）。
        """
        super().__init__()
        self._config: AppConfig = config
        self._devices: dict[str, Device] = {}
        self._zeroconf: Zeroconf | None = None
        self._browser: ServiceBrowser | None = None
        self._service_info: ServiceInfo | None = None

    async def start(self, port: int) -> None:
        """
        Business Logic（为什么需要这个函数）:
            应用启动后需要在局域网中注册自己的存在，并开始监听其他设备。

        Code Logic（这个函数做什么）:
            1. 创建 Zeroconf 实例
            2. 获取本机 IP 地址
            3. 构造 ServiceInfo（包含 device_id 和 device_name 的 TXT 记录）
            4. 通过 asyncio.to_thread 在后台注册服务（避免阻塞 UI）
            5. 创建 ServiceBrowser 开始浏览同类型服务
        """
        self._zeroconf = Zeroconf()

        # 获取本机局域网 IP（避免 Linux 上返回 127.0.1.1 的问题）
        local_ip: str = self._get_local_ip()
        logger.info("本机 IP: %s, 端口: %d", local_ip, port)

        # 构造 TXT 记录
        properties: dict[bytes, bytes] = {
            b"device_id": self._config.device_id.encode("utf-8"),
            b"device_name": self._config.device_name.encode("utf-8"),
        }

        self._service_info = ServiceInfo(
            type_=SERVICE_TYPE,
            name=f"{self._config.device_id}.{SERVICE_TYPE}",
            addresses=[socket.inet_aton(local_ip)],
            port=port,
            properties=properties,
        )

        # 在线程池中注册 mDNS 服务（register_service 在某些网络环境下会阻塞数秒）
        # 使用 asyncio.to_thread 保持在主事件循环上下文中，不阻塞 UI
        async def _register_async() -> None:
            """异步注册 mDNS 服务。"""
            try:
                assert self._zeroconf is not None
                assert self._service_info is not None
                await asyncio.to_thread(
                    self._zeroconf.register_service, self._service_info
                )
                logger.info(
                    "mDNS 服务已注册: %s (端口 %d)",
                    self._config.device_name,
                    port,
                )
            except Exception as e:
                logger.error("mDNS 服务注册失败: %s", e)

        # 启动注册任务（不 await，让它在后台完成）
        asyncio.ensure_future(_register_async())

        # 开始浏览服务（ServiceBrowser 自身在后台线程中运行，不会阻塞）
        self._browser = ServiceBrowser(
            self._zeroconf,
            SERVICE_TYPE,
            handlers=[self._on_service_state_change],
        )
        logger.info("mDNS 服务浏览已启动")

    def stop(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            应用关闭时需要注销 mDNS 服务，释放网络资源，通知局域网本设备下线。

        Code Logic（这个函数做什么）:
            1. 取消浏览（关闭 ServiceBrowser）
            2. 注销已注册的 ServiceInfo
            3. 关闭 Zeroconf 实例
        """
        if self._browser is not None:
            self._browser.cancel()
            self._browser = None

        if self._zeroconf is not None:
            if self._service_info is not None:
                self._zeroconf.unregister_service(self._service_info)
                self._service_info = None
            self._zeroconf.close()
            self._zeroconf = None

        self._devices.clear()
        logger.info("mDNS 服务已停止")

    def get_devices(self) -> dict[str, Device]:
        """
        Business Logic（为什么需要这个函数）:
            同步引擎和 UI 需要获取当前在线的设备列表来发起同步或展示状态。

        Code Logic（这个函数做什么）:
            返回当前发现的在线设备字典的副本 {device_id: Device}。
        """
        return dict(self._devices)

    @staticmethod
    def _get_local_ip() -> str:
        """
        Business Logic（为什么需要这个函数）:
            mDNS 注册需要本机的实际局域网 IP，但系统可能有多个网络接口
            （WiFi、VPN、Docker 等），需要优先选择真实局域网接口的 IP。

        Code Logic（这个函数做什么）:
            1. 通过 ip/ifconfig 获取所有网络接口 IP
            2. 过滤掉 loopback、docker、veth、utun 等虚拟接口
            3. 优先选择私有局域网段（192.168.x, 10.x, 172.16-31.x）
            4. 如果找不到，回退到 UDP socket 探测
        """
        import re
        import subprocess

        try:
            # Linux/Mac: 获取所有接口 IP
            result = subprocess.run(
                ["ip", "-4", "addr", "show"],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode != 0:
                # macOS 没有 ip 命令，用 ifconfig
                result = subprocess.run(
                    ["ifconfig"],
                    capture_output=True, text=True, timeout=3,
                )

            # 解析出 (接口名, IP) 对
            candidates: list[tuple[str, str]] = []
            current_iface: str = ""
            for line in result.stdout.split("\n"):
                # ip addr 格式: "2: wlp4s0: <...>"
                iface_match = re.match(r"^\d+:\s+(\S+?):", line)
                if iface_match:
                    current_iface = iface_match.group(1)
                # ip addr 格式: "    inet 192.168.6.17/24 ..."
                inet_match = re.search(r"inet\s+(\d+\.\d+\.\d+\.\d+)", line)
                if inet_match:
                    ip: str = inet_match.group(1)
                    candidates.append((current_iface, ip))

            # 过滤虚拟接口
            skip_prefixes: tuple[str, ...] = (
                "lo", "docker", "br-", "veth", "utun",
                "tun", "tailscale", "zt",
            )
            lan_ips: list[str] = []
            for iface, ip in candidates:
                if any(iface.startswith(p) for p in skip_prefixes):
                    continue
                if ip.startswith("127."):
                    continue
                # 私有局域网段优先
                if (ip.startswith("192.168.")
                        or ip.startswith("10.")
                        or re.match(r"^172\.(1[6-9]|2\d|3[01])\.", ip)):
                    lan_ips.append(ip)

            if lan_ips:
                logger.debug("局域网 IP 候选: %s", lan_ips)
                return lan_ips[0]

        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass

        # 回退方案
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except OSError:
            return socket.gethostbyname(socket.gethostname())

    def _on_service_state_change(self, **kwargs: object) -> None:
        """
        Business Logic（为什么需要这个函数）:
            当局域网中有设备上线或下线时，需要更新本地设备列表并通知 UI。

        Code Logic（这个函数做什么）:
            zeroconf ServiceBrowser 的回调，在后台线程中执行。
            注意：新版 zeroconf (>=0.131) 使用关键字参数调用回调，
            因此使用 **kwargs 接收以保证兼容性。
            - Added: 解析 ServiceInfo，创建 Device 对象，存入 _devices，emit device_found
            - Removed: 从 _devices 移除对应设备，emit device_lost
            过滤掉自己的设备 ID，避免发现自己。
            Qt 信号机制自动处理跨线程分发。
        """
        zeroconf: Zeroconf = kwargs["zeroconf"]  # type: ignore[assignment]
        service_type: str = kwargs["service_type"]  # type: ignore[assignment]
        name: str = kwargs["name"]  # type: ignore[assignment]
        state_change: ServiceStateChange = kwargs["state_change"]  # type: ignore[assignment]
        logger.debug(
            "mDNS 服务状态变化: name=%s, state=%s", name, state_change
        )

        if state_change == ServiceStateChange.Added:
            info: ServiceInfo | None = zeroconf.get_service_info(
                service_type, name
            )
            if info is None:
                logger.warning("无法获取服务信息: %s", name)
                return

            logger.debug(
                "服务详情: name=%s, addresses=%s, port=%s, properties=%s",
                name,
                [socket.inet_ntoa(a) for a in info.addresses] if info.addresses else [],
                info.port,
                info.properties,
            )

            # 解析 TXT 记录
            properties: dict[str, str] = {}
            if info.properties:
                for key, value in info.properties.items():
                    k: str = key.decode("utf-8") if isinstance(key, bytes) else key
                    v: str = value.decode("utf-8") if isinstance(value, bytes) else value
                    properties[k] = v

            device_id: str = properties.get("device_id", "")
            device_name: str = properties.get("device_name", "unknown")

            # 过滤掉自己
            if device_id == self._config.device_id:
                return

            if not device_id:
                logger.warning("服务 TXT 记录缺少 device_id: %s", name)
                return

            # 解析 IP 地址
            host: str = ""
            if info.addresses:
                host = socket.inet_ntoa(info.addresses[0])
            elif info.parsed_addresses():
                host = info.parsed_addresses()[0]

            if not host:
                logger.warning("无法解析服务地址: %s", name)
                return

            device: Device = Device(
                id=device_id,
                name=device_name,
                host=host,
                port=info.port,
                last_seen=datetime.now(),
                online=True,
            )

            self._devices[device_id] = device
            self.device_found.emit(device)
            logger.info("发现设备: %s (%s:%d)", device_name, host, info.port)

        elif state_change == ServiceStateChange.Removed:
            # 从服务名中提取 device_id
            # 服务名格式: "{device_id}._claude-partner._tcp.local."
            device_id_from_name: str = name.replace(f".{SERVICE_TYPE}", "")

            # 过滤掉自己
            if device_id_from_name == self._config.device_id:
                return

            if device_id_from_name in self._devices:
                del self._devices[device_id_from_name]
                self.device_lost.emit(device_id_from_name)
                logger.info("设备离线: %s", device_id_from_name)
