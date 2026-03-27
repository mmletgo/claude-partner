# -*- coding: utf-8 -*-
"""向量时钟模块：实现分布式系统中的因果关系跟踪。"""


class VectorClock:
    """
    向量时钟实现，用于 Prompt 同步时的因果关系判断。

    Business Logic（为什么需要这个类）:
        多设备同时编辑 Prompt 时，需要判断哪个版本更新或是否存在冲突。
        向量时钟是经典的分布式因果序算法，通过记录每个设备的操作计数来追踪变更历史。

    Code Logic（这个类做什么）:
        提供向量时钟的三个核心操作：递增（本地修改时）、合并（同步时）、比较（判断先后关系）。
        所有方法均为静态方法，不持有状态，时钟以 dict[str, int] 形式传入传出。
    """

    @staticmethod
    def increment(clock: dict[str, int], device_id: str) -> dict[str, int]:
        """
        Business Logic（为什么需要这个函数）:
            本地设备修改 Prompt 后，需要递增该设备在向量时钟中的计数器，
            表示产生了一次新的因果事件。

        Code Logic（这个函数做什么）:
            复制输入时钟（不修改原始），将 device_id 对应的计数器加 1，
            若该 key 不存在则从 0 开始。返回新的时钟字典。
        """
        new_clock: dict[str, int] = dict(clock)
        new_clock[device_id] = new_clock.get(device_id, 0) + 1
        return new_clock

    @staticmethod
    def merge(clock_a: dict[str, int], clock_b: dict[str, int]) -> dict[str, int]:
        """
        Business Logic（为什么需要这个函数）:
            同步两个设备的 Prompt 时，需要合并它们各自的向量时钟，
            生成一个包含双方所有因果历史的新时钟。

        Code Logic（这个函数做什么）:
            取两个时钟中所有 key 的并集，每个 key 取最大值。
            返回合并后的新时钟字典。
        """
        all_keys: set[str] = set(clock_a.keys()) | set(clock_b.keys())
        merged: dict[str, int] = {}
        for key in all_keys:
            merged[key] = max(clock_a.get(key, 0), clock_b.get(key, 0))
        return merged

    @staticmethod
    def compare(clock_a: dict[str, int], clock_b: dict[str, int]) -> str:
        """
        Business Logic（为什么需要这个函数）:
            同步时需要判断两个 Prompt 版本的先后关系：
            一个严格领先另一个（可直接覆盖），还是并发修改（需要冲突解决）。

        Code Logic（这个函数做什么）:
            比较两个向量时钟的偏序关系，返回:
            - 'greater': clock_a 每个分量 >= clock_b 且至少一个 >
            - 'less': clock_b 每个分量 >= clock_a 且至少一个 >
            - 'equal': 两者完全相同
            - 'concurrent': 互有领先（存在冲突）
        """
        all_keys: set[str] = set(clock_a.keys()) | set(clock_b.keys())

        a_greater: bool = False
        b_greater: bool = False

        for key in all_keys:
            val_a: int = clock_a.get(key, 0)
            val_b: int = clock_b.get(key, 0)
            if val_a > val_b:
                a_greater = True
            elif val_b > val_a:
                b_greater = True

        if a_greater and b_greater:
            return "concurrent"
        elif a_greater:
            return "greater"
        elif b_greater:
            return "less"
        else:
            return "equal"
