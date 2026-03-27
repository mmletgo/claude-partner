# -*- coding: utf-8 -*-
"""HTTP API 路由模块：定义 P2P 通信的 RESTful 接口。"""

from aiohttp import web
from typing import Callable, Awaitable
import json
import logging

from claude_partner.config import AppConfig
from claude_partner.storage.prompt_repo import PromptRepository
from claude_partner.models.prompt import Prompt
from claude_partner.sync.vector_clock import VectorClock

logger: logging.Logger = logging.getLogger(__name__)


class APIProtocol:
    """
    HTTP API 路由定义和请求处理，作为 P2P 通信的服务端接口。

    Business Logic（为什么需要这个类）:
        每个 Claude Partner 实例既是客户端也是服务端。当其他设备发起同步请求或
        文件传输请求时，需要通过标准化的 HTTP API 来处理。

    Code Logic（这个类做什么）:
        定义 6 个 API 端点：
        - /api/health: 健康检查
        - /api/sync/pull: 被拉取 prompt（对端发送摘要，本端返回对端需要的 prompt）
        - /api/sync/push: 接收对端推送的 prompt
        - /api/transfer/init: 初始化文件传输
        - /api/transfer/chunk/{transfer_id}: 接收文件分块
        - /api/transfer/status/{transfer_id}: 查询传输状态
    """

    def __init__(
        self,
        config: AppConfig,
        prompt_repo: PromptRepository,
        on_transfer_init: Callable[[dict], dict] | None = None,
        on_transfer_chunk: Callable[[str, int, bytes], Awaitable[dict]] | None = None,
        get_transfer_status: Callable[[str], dict] | None = None,
    ) -> None:
        """
        Business Logic（为什么需要这个函数）:
            初始化 API 处理器，需要配置信息、数据仓库以及文件传输的回调函数。

        Code Logic（这个函数做什么）:
            保存依赖注入的组件引用。文件传输相关的回调是可选的，
            未提供时对应端点返回 501 Not Implemented。
        """
        self._config: AppConfig = config
        self._prompt_repo: PromptRepository = prompt_repo
        self._on_transfer_init: Callable[[dict], dict] | None = on_transfer_init
        self._on_transfer_chunk: Callable[[str, int, bytes], Awaitable[dict]] | None = on_transfer_chunk
        self._get_transfer_status: Callable[[str], dict] | None = get_transfer_status

    def setup_routes(self, app: web.Application) -> None:
        """
        Business Logic（为什么需要这个函数）:
            将所有 API 端点注册到 aiohttp 应用的路由表中。

        Code Logic（这个函数做什么）:
            为 app.router 添加 GET 和 POST 路由，关联到对应的 handler 方法。
        """
        app.router.add_get("/api/health", self.handle_health)
        app.router.add_post("/api/sync/pull", self.handle_sync_pull)
        app.router.add_post("/api/sync/push", self.handle_sync_push)
        app.router.add_post("/api/transfer/init", self.handle_transfer_init)
        app.router.add_post(
            "/api/transfer/chunk/{transfer_id}", self.handle_transfer_chunk
        )
        app.router.add_get(
            "/api/transfer/status/{transfer_id}", self.handle_transfer_status
        )

    async def handle_health(self, request: web.Request) -> web.Response:
        """
        Business Logic（为什么需要这个函数）:
            对端设备需要检查本机是否在线且可通信，用于同步前的连通性验证。

        Code Logic（这个函数做什么）:
            返回 JSON 响应 {status: "ok", device_id, device_name}。
        """
        data: dict = {
            "status": "ok",
            "device_id": self._config.device_id,
            "device_name": self._config.device_name,
        }
        return web.json_response(data)

    async def handle_sync_pull(self, request: web.Request) -> web.Response:
        """
        Business Logic（为什么需要这个函数）:
            对端设备发起 pull 请求时，发送它的 prompt 摘要列表，
            本端比较后返回对端需要的（本端有更新的或本端独有的）prompt。

        Code Logic（这个函数做什么）:
            1. 解析请求体中的 remote_summaries [{id, vector_clock}, ...]
            2. 获取本端的 sync_summary
            3. 对比双方摘要：
               - 本端有但对端没有的 prompt -> 返回
               - 本端向量时钟领先或并发的 prompt -> 返回
            4. 从数据库读取需要返回的 prompt 完整数据
            5. 返回 {prompts: [prompt_dict, ...]}
        """
        try:
            body: dict = await request.json()
            remote_summaries: list[dict] = body.get("summaries", [])

            # 获取本端摘要
            local_summaries: list[dict] = await self._prompt_repo.get_sync_summary()

            # 构建查找表
            remote_map: dict[str, dict[str, int]] = {
                s["id"]: s["vector_clock"] for s in remote_summaries
            }

            # 找出本端需要返回给对端的 prompt id
            need_send_ids: list[str] = []
            for local_s in local_summaries:
                prompt_id: str = local_s["id"]
                local_clock: dict[str, int] = local_s["vector_clock"]

                if prompt_id not in remote_map:
                    # 本端有但对端没有
                    need_send_ids.append(prompt_id)
                else:
                    remote_clock: dict[str, int] = remote_map[prompt_id]
                    relation: str = VectorClock.compare(local_clock, remote_clock)
                    if relation in ("greater", "concurrent"):
                        # 本端领先或并发，发送给对端做合并
                        need_send_ids.append(prompt_id)

            # 读取完整的 prompt 数据
            prompts: list[dict] = []
            for pid in need_send_ids:
                prompt: Prompt | None = await self._prompt_repo.get_by_id(pid)
                if prompt is not None:
                    prompts.append(prompt.to_dict())

            logger.info(
                "sync/pull: 对端摘要 %d 条，本端摘要 %d 条，返回 %d 条 prompt",
                len(remote_summaries),
                len(local_summaries),
                len(prompts),
            )
            return web.json_response({"prompts": prompts})

        except Exception as e:
            logger.error("handle_sync_pull 异常: %s", e, exc_info=True)
            return web.json_response(
                {"error": str(e)}, status=500
            )

    async def handle_sync_push(self, request: web.Request) -> web.Response:
        """
        Business Logic（为什么需要这个函数）:
            对端设备将本端缺少或过时的 prompt 推送过来，本端需要接收并存储。

        Code Logic（这个函数做什么）:
            1. 解析请求体中的 prompts 列表
            2. 将字典转换为 Prompt 对象
            3. 调用 prompt_repo.bulk_upsert 批量写入
            4. 返回 {accepted: count}
        """
        try:
            body: dict = await request.json()
            prompt_dicts: list[dict] = body.get("prompts", [])

            prompts: list[Prompt] = [
                Prompt.from_dict(d) for d in prompt_dicts
            ]
            await self._prompt_repo.bulk_upsert(prompts)

            logger.info("sync/push: 接收 %d 条 prompt", len(prompts))
            return web.json_response({"accepted": len(prompts)})

        except Exception as e:
            logger.error("handle_sync_push 异常: %s", e, exc_info=True)
            return web.json_response(
                {"error": str(e)}, status=500
            )

    async def handle_transfer_init(self, request: web.Request) -> web.Response:
        """
        Business Logic（为什么需要这个函数）:
            对端发起文件传输前，需要先发送文件元数据（文件名、大小、校验和），
            本端确认后分配 transfer_id 用于后续分块传输。

        Code Logic（这个函数做什么）:
            解析请求体 {filename, size, sha256, chunk_size}，转发给 on_transfer_init 回调。
            回调未注册时返回 501 Not Implemented。
        """
        if self._on_transfer_init is None:
            return web.json_response(
                {"error": "文件传输功能未启用"}, status=501
            )

        try:
            body: dict = await request.json()
            result: dict = self._on_transfer_init(body)
            return web.json_response(result)
        except Exception as e:
            logger.error("handle_transfer_init 异常: %s", e, exc_info=True)
            return web.json_response(
                {"error": str(e)}, status=500
            )

    async def handle_transfer_chunk(self, request: web.Request) -> web.Response:
        """
        Business Logic（为什么需要这个函数）:
            文件传输过程中，对端分块发送文件数据，本端逐块接收并写入。

        Code Logic（这个函数做什么）:
            1. 从 URL 路径参数获取 transfer_id
            2. 从 X-Chunk-Offset header 获取 offset
            3. 从 body 读取原始 bytes 数据
            4. 转发给 on_transfer_chunk 回调处理
        """
        if self._on_transfer_chunk is None:
            return web.json_response(
                {"error": "文件传输功能未启用"}, status=501
            )

        try:
            transfer_id: str = request.match_info["transfer_id"]
            offset_str: str = request.headers.get("X-Chunk-Offset", "0")
            offset: int = int(offset_str)
            data: bytes = await request.read()

            result: dict = await self._on_transfer_chunk(transfer_id, offset, data)
            return web.json_response(result)
        except Exception as e:
            logger.error("handle_transfer_chunk 异常: %s", e, exc_info=True)
            return web.json_response(
                {"error": str(e)}, status=500
            )

    async def handle_transfer_status(self, request: web.Request) -> web.Response:
        """
        Business Logic（为什么需要这个函数）:
            文件传输过程中或传输后，需要查询传输进度和状态（是否完成、已接收大小等）。

        Code Logic（这个函数做什么）:
            从 URL 路径参数获取 transfer_id，调用 get_transfer_status 回调查询状态。
        """
        if self._get_transfer_status is None:
            return web.json_response(
                {"error": "文件传输功能未启用"}, status=501
            )

        try:
            transfer_id: str = request.match_info["transfer_id"]
            result: dict = self._get_transfer_status(transfer_id)
            return web.json_response(result)
        except Exception as e:
            logger.error("handle_transfer_status 异常: %s", e, exc_info=True)
            return web.json_response(
                {"error": str(e)}, status=500
            )
