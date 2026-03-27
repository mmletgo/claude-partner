# -*- coding: utf-8 -*-
"""SQLite 数据库连接管理和 schema 初始化。"""

import aiosqlite


class Database:
    """
    SQLite 数据库连接管理器，使用单连接复用模式。

    Business Logic（为什么需要这个类）:
        应用需要一个统一的数据库访问入口来管理 Prompt 和传输历史的持久化，
        同时确保表结构在首次运行时自动创建。

    Code Logic（这个类做什么）:
        管理一个 aiosqlite 连接的生命周期：__init__ 记录路径但不连接，
        initialize() 创建连接并建表，get_connection() 返回同一连接，
        close() 关闭连接释放资源。
    """

    def __init__(self, db_path: str) -> None:
        """
        Business Logic（为什么需要这个函数）:
            构造时只记录数据库路径，延迟到 initialize() 时才真正建立连接，
            以便在异步环境中正确初始化。

        Code Logic（这个函数做什么）:
            保存 db_path，将 _connection 初始化为 None。
        """
        self._db_path: str = db_path
        self._connection: aiosqlite.Connection | None = None

    async def initialize(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            应用启动时需要确保数据库连接已建立且表结构存在，
            这样后续的 CRUD 操作才能正常执行。

        Code Logic（这个函数做什么）:
            创建 aiosqlite 连接，启用 WAL 模式提升并发性能，
            然后通过 CREATE TABLE IF NOT EXISTS 创建 prompts 和 transfer_history 表。
        """
        self._connection = await aiosqlite.connect(self._db_path)
        self._connection.row_factory = aiosqlite.Row

        # 启用 WAL 模式
        await self._connection.execute("PRAGMA journal_mode=WAL")

        # 创建 prompts 表
        await self._connection.execute("""
            CREATE TABLE IF NOT EXISTS prompts (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                tags TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                device_id TEXT NOT NULL,
                vector_clock TEXT NOT NULL,
                deleted INTEGER DEFAULT 0
            )
        """)

        # 创建 transfer_history 表
        await self._connection.execute("""
            CREATE TABLE IF NOT EXISTS transfer_history (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                size INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                direction TEXT NOT NULL,
                peer_device_id TEXT NOT NULL,
                status TEXT NOT NULL,
                transferred_bytes INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                completed_at TEXT
            )
        """)

        await self._connection.commit()

    async def get_connection(self) -> aiosqlite.Connection:
        """
        Business Logic（为什么需要这个函数）:
            各个 Repository 需要获取数据库连接来执行 SQL 操作。

        Code Logic（这个函数做什么）:
            返回已初始化的单例连接。如果连接未初始化则抛出异常。
        """
        if self._connection is None:
            raise RuntimeError("数据库未初始化，请先调用 initialize()")
        return self._connection

    async def close(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            应用关闭时需要释放数据库连接资源，避免数据丢失和锁文件残留。

        Code Logic（这个函数做什么）:
            关闭 aiosqlite 连接并将引用置为 None。
        """
        if self._connection is not None:
            await self._connection.close()
            self._connection = None
