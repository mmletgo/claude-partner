# -*- coding: utf-8 -*-
"""HTTP 服务端模块：基于 aiohttp 的 HTTP 服务器。"""

from aiohttp import web
import logging

from claude_partner.network.protocol import APIProtocol

logger: logging.Logger = logging.getLogger(__name__)


class HTTPServer:
    """
    aiohttp HTTP 服务端，承载 P2P 通信的 API 接口。

    Business Logic（为什么需要这个类）:
        每个 Claude Partner 实例需要监听 HTTP 端口接收其他设备的请求
        （同步拉取/推送、文件传输等），这是 P2P 架构中服务端角色的核心。

    Code Logic（这个类做什么）:
        封装 aiohttp 的 web.Application、AppRunner 和 TCPSite，
        提供启动（自动分配端口）和停止的生命周期管理。
        支持 port=0 让操作系统自动分配可用端口。
    """

    def __init__(self, protocol: APIProtocol) -> None:
        """
        Business Logic（为什么需要这个函数）:
            HTTP 服务器需要知道路由配置（由 APIProtocol 提供）来处理请求。

        Code Logic（这个函数做什么）:
            保存 protocol 引用，初始化内部状态。
        """
        self._protocol: APIProtocol = protocol
        self._app: web.Application | None = None
        self._runner: web.AppRunner | None = None
        self._site: web.TCPSite | None = None
        self._port: int = 0

    async def start(self, port: int = 0) -> int:
        """
        Business Logic（为什么需要这个函数）:
            应用启动时需要开始监听 HTTP 端口，以接收其他设备的通信请求。

        Code Logic（这个函数做什么）:
            1. 创建 aiohttp web.Application
            2. 注册 APIProtocol 定义的路由
            3. 使用 AppRunner + TCPSite 启动服务
            4. port=0 时由操作系统自动分配端口
            5. 从 socket 获取实际监听端口并返回
        """
        # client_max_size 设为 2MB，文件传输 chunk 大小为 1MB + HTTP 开销
        self._app = web.Application(client_max_size=2 * 1024 * 1024)
        self._protocol.setup_routes(self._app)

        self._runner = web.AppRunner(self._app)
        await self._runner.setup()

        self._site = web.TCPSite(self._runner, "0.0.0.0", port)
        await self._site.start()

        # 获取实际监听端口
        if self._site._server is not None and self._site._server.sockets:
            self._port = self._site._server.sockets[0].getsockname()[1]
        else:
            self._port = port

        logger.info("HTTP 服务已启动，监听端口: %d", self._port)
        return self._port

    async def stop(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            应用关闭时需要优雅地停止 HTTP 服务，释放端口资源。

        Code Logic（这个函数做什么）:
            依次停止 TCPSite、清理 AppRunner，释放所有网络资源。
        """
        if self._site is not None:
            await self._site.stop()
            self._site = None

        if self._runner is not None:
            await self._runner.cleanup()
            self._runner = None

        self._app = None
        logger.info("HTTP 服务已停止")

    @property
    def port(self) -> int:
        """
        Business Logic（为什么需要这个函数）:
            mDNS 注册和 UI 显示需要知道当前服务实际监听的端口号。

        Code Logic（这个函数做什么）:
            返回启动时获取的实际端口号。
        """
        return self._port
