# -*- coding: utf-8 -*-
"""Prompt 合并模块：实现同步时的冲突检测和解决策略。"""

from claude_partner.models.prompt import Prompt
from claude_partner.sync.vector_clock import VectorClock


class PromptMerger:
    """
    Prompt 同步冲突解决器。

    Business Logic（为什么需要这个类）:
        多设备同步 Prompt 时，可能出现同一条 Prompt 在不同设备上被独立修改的情况。
        需要一套冲突解决策略来决定保留哪个版本，保证数据最终一致。

    Code Logic（这个类做什么）:
        基于向量时钟判断版本先后关系：
        - 严格领先：直接覆盖
        - 并发冲突：使用 LWW（Last-Writer-Wins）策略，以 updated_at 时间戳决定胜出方
        - 无论谁胜出，最终都合并双方向量时钟
        所有方法均为静态方法。
    """

    @staticmethod
    def should_update(local: Prompt, remote: Prompt) -> bool:
        """
        Business Logic（为什么需要这个函数）:
            同步时收到对端的 Prompt 版本，需要判断是否应该用对端版本覆盖本地版本。

        Code Logic（这个函数做什么）:
            使用向量时钟比较两个版本：
            - remote 严格领先 (greater) -> True，用 remote 覆盖
            - local 严格领先 (less) -> False，保持本地
            - 并发 (concurrent) -> 比较 updated_at，更晚的胜出 (LWW)
            - 完全相同 (equal) -> False，无需更新
        """
        relation: str = VectorClock.compare(remote.vector_clock, local.vector_clock)

        if relation == "greater":
            # remote 的向量时钟严格领先 local
            return True
        elif relation == "less":
            # local 的向量时钟严格领先 remote
            return False
        elif relation == "concurrent":
            # 并发修改，使用 LWW（Last-Writer-Wins）策略
            return remote.updated_at > local.updated_at
        else:
            # equal: 完全相同，无需更新
            return False

    @staticmethod
    def merge_prompt(local: Prompt, remote: Prompt) -> Prompt:
        """
        Business Logic（为什么需要这个函数）:
            同步时需要将本地和远端的 Prompt 版本合并为一个最终版本，
            包含正确的内容和完整的因果历史（合并后的向量时钟）。

        Code Logic（这个函数做什么）:
            1. 用 should_update 决定内容胜出方
            2. 无论谁胜出，都合并双方向量时钟以保留完整因果历史
            3. 返回新的 Prompt 实例（胜出方内容 + 合并后的时钟）
        """
        merged_clock: dict[str, int] = VectorClock.merge(
            local.vector_clock, remote.vector_clock
        )

        if PromptMerger.should_update(local, remote):
            # remote 胜出，使用 remote 的内容
            return Prompt(
                id=remote.id,
                title=remote.title,
                content=remote.content,
                tags=remote.tags,
                created_at=remote.created_at,
                updated_at=remote.updated_at,
                device_id=remote.device_id,
                vector_clock=merged_clock,
                deleted=remote.deleted,
            )
        else:
            # local 胜出，使用 local 的内容
            return Prompt(
                id=local.id,
                title=local.title,
                content=local.content,
                tags=local.tags,
                created_at=local.created_at,
                updated_at=local.updated_at,
                device_id=local.device_id,
                vector_clock=merged_clock,
                deleted=local.deleted,
            )

    @staticmethod
    def diff_summaries(
        local_summary: list[dict], remote_summary: list[dict]
    ) -> tuple[list[str], list[str]]:
        """
        Business Logic（为什么需要这个函数）:
            同步前需要先比较双方的 Prompt 摘要列表，确定哪些需要从对端拉取、
            哪些需要推送给对端，避免传输所有数据浪费带宽。

        Code Logic（这个函数做什么）:
            输入: 本端和对端的摘要列表 [{id, vector_clock}, ...]
            输出: (need_from_remote_ids, need_push_to_remote_ids)
            - need_from_remote: 对端有但本端没有，或对端向量时钟领先/并发的 prompt id
            - need_push_to_remote: 本端有但对端没有，或本端向量时钟领先/并发的 prompt id
        """
        local_map: dict[str, dict[str, int]] = {
            s["id"]: s["vector_clock"] for s in local_summary
        }
        remote_map: dict[str, dict[str, int]] = {
            s["id"]: s["vector_clock"] for s in remote_summary
        }

        need_from_remote: list[str] = []
        need_push_to_remote: list[str] = []

        # 检查 remote 中的每个 prompt
        for prompt_id, remote_clock in remote_map.items():
            if prompt_id not in local_map:
                # 对端有但本端没有
                need_from_remote.append(prompt_id)
            else:
                local_clock: dict[str, int] = local_map[prompt_id]
                relation: str = VectorClock.compare(remote_clock, local_clock)
                if relation in ("greater", "concurrent"):
                    # 对端领先或并发，需要拉取来做合并
                    need_from_remote.append(prompt_id)

        # 检查 local 中的每个 prompt
        for prompt_id, local_clock in local_map.items():
            if prompt_id not in remote_map:
                # 本端有但对端没有
                need_push_to_remote.append(prompt_id)
            else:
                remote_clock = remote_map[prompt_id]
                relation = VectorClock.compare(local_clock, remote_clock)
                if relation in ("greater", "concurrent"):
                    # 本端领先或并发，需要推送给对端做合并
                    need_push_to_remote.append(prompt_id)

        return need_from_remote, need_push_to_remote
