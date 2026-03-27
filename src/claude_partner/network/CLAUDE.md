# network/ - 网络通信层

## 模块概述

负责局域网设备发现和 HTTP 通信，是 P2P 架构的网络基础。

## 文件说明

### discovery.py - mDNS 设备发现
- `DeviceDiscovery(QObject)`: 通过 zeroconf 注册和发现局域网设备
  - mDNS 服务类型: `_claude-partner._tcp.local.`
  - TXT 记录包含 device_id 和 device_name
  - 回调在后台线程执行，通过 Qt 信号跨线程通知
  - 自动过滤本机设备 ID
  - 信号: `device_found(object)`, `device_lost(str)`

### protocol.py - HTTP API 路由
- `APIProtocol`: 定义 6 个 API 端点的请求处理逻辑
  - `GET /api/health`: 健康检查
  - `POST /api/sync/pull`: 接收对端摘要，返回对端需要的 prompt
  - `POST /api/sync/push`: 接收对端推送的 prompt，存入本地
  - `POST /api/transfer/init`: 初始化文件传输
  - `POST /api/transfer/chunk/{transfer_id}`: 接收文件分块（offset 通过 X-Chunk-Offset header 传递）
  - `GET /api/transfer/status/{transfer_id}`: 查询传输状态
- 文件传输端点通过回调函数注入，未注册时返回 501

### server.py - HTTP 服务端
- `HTTPServer`: 封装 aiohttp 的 AppRunner + TCPSite
  - 支持 port=0 自动分配端口
  - 通过 `site._server.sockets[0].getsockname()[1]` 获取实际端口

### client.py - HTTP 客户端
- `PeerClient`: 调用对端 API 的客户端
  - 懒初始化 aiohttp.ClientSession（避免在 __init__ 中访问事件循环）
  - 方法与 APIProtocol 端点一一对应
  - 默认 10 秒超时

## 依赖关系
- 依赖: `models.device`, `models.prompt`, `config`, `storage.prompt_repo`, `sync.vector_clock`
- 被依赖: `sync.engine`（使用 PeerClient）, `app.py`（启动 HTTPServer 和 DeviceDiscovery）
