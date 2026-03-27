# -*- coding: utf-8 -*-
"""Prompt 仓库：提供 Prompt 的 CRUD 操作和查询功能。"""

import json
from datetime import datetime

from claude_partner.models.prompt import Prompt
from claude_partner.storage.database import Database


class PromptRepository:
    """
    Prompt 的数据访问层，封装所有数据库操作。

    Business Logic（为什么需要这个类）:
        Prompt 管理需要创建、修改、软删除、搜索、按标签筛选等功能，
        同步引擎还需要批量 upsert 和获取同步摘要。
        将这些操作集中在一个 Repository 中，便于上层模块统一调用。

    Code Logic（这个类做什么）:
        通过 Database 获取连接执行 SQL，处理 JSON 字段（tags, vector_clock）
        的序列化/反序列化，以及 datetime 的 ISO 格式转换。
    """

    def __init__(self, database: Database) -> None:
        """
        Business Logic（为什么需要这个函数）:
            Repository 需要持有 Database 引用以获取连接执行操作。

        Code Logic（这个函数做什么）:
            保存 Database 实例的引用。
        """
        self._database: Database = database

    def _row_to_prompt(self, row: dict) -> Prompt:
        """
        Business Logic（为什么需要这个函数）:
            数据库查询返回的行数据需要转换为 Prompt 对象供业务层使用。

        Code Logic（这个函数做什么）:
            将数据库行（dict/Row）转换为 Prompt 实例，
            JSON 字符串字段反序列化为 list/dict，文本日期转为 datetime。
        """
        tags: list[str] = json.loads(row["tags"])
        vector_clock: dict[str, int] = json.loads(row["vector_clock"])
        return Prompt(
            id=row["id"],
            title=row["title"],
            content=row["content"],
            tags=tags,
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            device_id=row["device_id"],
            vector_clock=vector_clock,
            deleted=bool(row["deleted"]),
        )

    async def create(self, prompt: Prompt) -> None:
        """
        Business Logic（为什么需要这个函数）:
            用户新建 Prompt 时需要将其持久化到数据库。

        Code Logic（这个函数做什么）:
            将 Prompt 插入 prompts 表，tags 和 vector_clock 序列化为 JSON 字符串。
        """
        conn = await self._database.get_connection()
        await conn.execute(
            """
            INSERT INTO prompts (id, title, content, tags, created_at, updated_at,
                                 device_id, vector_clock, deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                prompt.id,
                prompt.title,
                prompt.content,
                json.dumps(prompt.tags, ensure_ascii=False),
                prompt.created_at.isoformat(),
                prompt.updated_at.isoformat(),
                prompt.device_id,
                json.dumps(prompt.vector_clock, ensure_ascii=False),
                int(prompt.deleted),
            ),
        )
        await conn.commit()

    async def update(self, prompt: Prompt) -> None:
        """
        Business Logic（为什么需要这个函数）:
            用户编辑 Prompt 的标题、内容或标签后需要更新数据库记录。

        Code Logic（这个函数做什么）:
            根据 id 更新 prompts 表中对应记录的所有字段。
        """
        conn = await self._database.get_connection()
        await conn.execute(
            """
            UPDATE prompts
            SET title = ?, content = ?, tags = ?, updated_at = ?,
                device_id = ?, vector_clock = ?, deleted = ?
            WHERE id = ?
            """,
            (
                prompt.title,
                prompt.content,
                json.dumps(prompt.tags, ensure_ascii=False),
                prompt.updated_at.isoformat(),
                prompt.device_id,
                json.dumps(prompt.vector_clock, ensure_ascii=False),
                int(prompt.deleted),
                prompt.id,
            ),
        )
        await conn.commit()

    async def delete(self, prompt_id: str) -> None:
        """
        Business Logic（为什么需要这个函数）:
            用户删除 Prompt 时使用软删除（标记 deleted=1），
            这样同步引擎仍能感知到删除操作并传播到其他设备。

        Code Logic（这个函数做什么）:
            将指定 id 的记录 deleted 字段置为 1，同时更新 updated_at 为当前时间。
        """
        conn = await self._database.get_connection()
        now: str = datetime.now().isoformat()
        await conn.execute(
            "UPDATE prompts SET deleted = 1, updated_at = ? WHERE id = ?",
            (now, prompt_id),
        )
        await conn.commit()

    async def get_by_id(self, prompt_id: str) -> Prompt | None:
        """
        Business Logic（为什么需要这个函数）:
            需要根据 ID 精确查找单条 Prompt，用于查看详情或同步时获取完整数据。

        Code Logic（这个函数做什么）:
            按主键查询 prompts 表，找到则返回 Prompt 实例，否则返回 None。
        """
        conn = await self._database.get_connection()
        cursor = await conn.execute(
            "SELECT * FROM prompts WHERE id = ?", (prompt_id,)
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return self._row_to_prompt(dict(row))

    async def get_all(self, include_deleted: bool = False) -> list[Prompt]:
        """
        Business Logic（为什么需要这个函数）:
            UI 列表页需要获取所有 Prompt 展示给用户。
            默认不包含已删除的记录，但同步逻辑可能需要获取全部。

        Code Logic（这个函数做什么）:
            查询 prompts 表所有记录，按 updated_at 降序排列。
            include_deleted=False 时过滤掉 deleted=1 的记录。
        """
        conn = await self._database.get_connection()
        if include_deleted:
            cursor = await conn.execute(
                "SELECT * FROM prompts ORDER BY updated_at DESC"
            )
        else:
            cursor = await conn.execute(
                "SELECT * FROM prompts WHERE deleted = 0 ORDER BY updated_at DESC"
            )
        rows = await cursor.fetchall()
        return [self._row_to_prompt(dict(row)) for row in rows]

    async def search(self, keyword: str) -> list[Prompt]:
        """
        Business Logic（为什么需要这个函数）:
            用户需要通过关键词搜索 Prompt 的标题和内容快速定位目标记录。

        Code Logic（这个函数做什么）:
            使用 LIKE '%keyword%' 在 title 和 content 上模糊匹配，
            不含已删除记录，按 updated_at 降序排列。
        """
        conn = await self._database.get_connection()
        pattern: str = f"%{keyword}%"
        cursor = await conn.execute(
            """
            SELECT * FROM prompts
            WHERE deleted = 0 AND (title LIKE ? OR content LIKE ?)
            ORDER BY updated_at DESC
            """,
            (pattern, pattern),
        )
        rows = await cursor.fetchall()
        return [self._row_to_prompt(dict(row)) for row in rows]

    async def filter_by_tags(self, tags: list[str]) -> list[Prompt]:
        """
        Business Logic（为什么需要这个函数）:
            用户需要按标签筛选 Prompt，快速找到某一类别的所有记录。

        Code Logic（这个函数做什么）:
            使用 SQLite 的 json_each 函数展开 tags JSON 数组，
            与给定标签列表做交集匹配，返回含任一给定标签的非删除 Prompt。
        """
        if not tags:
            return []

        conn = await self._database.get_connection()
        placeholders: str = ",".join("?" for _ in tags)
        cursor = await conn.execute(
            f"""
            SELECT DISTINCT p.* FROM prompts p, json_each(p.tags) AS t
            WHERE p.deleted = 0 AND t.value IN ({placeholders})
            ORDER BY p.updated_at DESC
            """,
            tuple(tags),
        )
        rows = await cursor.fetchall()
        return [self._row_to_prompt(dict(row)) for row in rows]

    async def get_all_tags(self) -> list[str]:
        """
        Business Logic（为什么需要这个函数）:
            UI 的标签筛选面板需要展示所有已使用的标签列表供用户选择。

        Code Logic（这个函数做什么）:
            从所有非删除 Prompt 的 tags 字段中提取并去重所有标签，
            使用 json_each 展开 JSON 数组后 DISTINCT 去重并排序。
        """
        conn = await self._database.get_connection()
        cursor = await conn.execute(
            """
            SELECT DISTINCT t.value AS tag
            FROM prompts p, json_each(p.tags) AS t
            WHERE p.deleted = 0
            ORDER BY t.value
            """
        )
        rows = await cursor.fetchall()
        return [row["tag"] for row in rows]

    async def get_sync_summary(self) -> list[dict]:
        """
        Business Logic（为什么需要这个函数）:
            同步引擎在对比本地与远端数据差异时，需要获取所有 Prompt 的 ID
            和向量时钟，包括已删除的记录（因为删除也需要同步）。

        Code Logic（这个函数做什么）:
            查询所有 Prompt 的 id 和 vector_clock 字段（含 deleted 记录），
            返回 [{id, vector_clock}] 列表。
        """
        conn = await self._database.get_connection()
        cursor = await conn.execute(
            "SELECT id, vector_clock FROM prompts"
        )
        rows = await cursor.fetchall()
        result: list[dict] = []
        for row in rows:
            result.append({
                "id": row["id"],
                "vector_clock": json.loads(row["vector_clock"]),
            })
        return result

    async def bulk_upsert(self, prompts: list[Prompt]) -> None:
        """
        Business Logic（为什么需要这个函数）:
            同步引擎从对端拉取到多条 Prompt 后需要批量写入本地数据库，
            已存在的记录需要覆盖更新。

        Code Logic（这个函数做什么）:
            使用 INSERT OR REPLACE 批量插入/替换 Prompt 记录。
            在同一事务中执行以保证原子性。
        """
        if not prompts:
            return

        conn = await self._database.get_connection()
        data: list[tuple] = []
        for prompt in prompts:
            data.append((
                prompt.id,
                prompt.title,
                prompt.content,
                json.dumps(prompt.tags, ensure_ascii=False),
                prompt.created_at.isoformat(),
                prompt.updated_at.isoformat(),
                prompt.device_id,
                json.dumps(prompt.vector_clock, ensure_ascii=False),
                int(prompt.deleted),
            ))

        await conn.executemany(
            """
            INSERT OR REPLACE INTO prompts
                (id, title, content, tags, created_at, updated_at,
                 device_id, vector_clock, deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            data,
        )
        await conn.commit()
