# -*- coding: utf-8 -*-
"""全局快捷键管理模块：Linux 使用 Xlib XGrabKey，macOS/Windows 回退到 pynput。"""

from __future__ import annotations

import logging
import sys
import threading
import time
from typing import TYPE_CHECKING

from PyQt6.QtCore import QObject, pyqtSignal, QTimer

# Linux X11 方案
if sys.platform.startswith("linux"):
    from Xlib import X, XK, display as xdisplay

# macOS / Windows 回退方案
if not sys.platform.startswith("linux"):
    from pynput import keyboard

if TYPE_CHECKING:
    from Xlib.display import Display
    from pynput import keyboard as _pynput_keyboard

logger = logging.getLogger(__name__)

# pynput 格式 <-> 人类可读格式 转换预设
HOTKEY_PRESETS: list[tuple[str, str]] = [
    ("<ctrl>+<shift>+s", "Ctrl+Shift+S"),
    ("<ctrl>+<alt>+s", "Ctrl+Alt+S"),
    ("<ctrl>+<shift>+a", "Ctrl+Shift+A"),
    ("<ctrl>+<shift>+x", "Ctrl+Shift+X"),
]

# 修饰键映射：pynput 格式 -> 人类可读格式
_MODIFIER_TO_DISPLAY: dict[str, str] = {
    "<ctrl>": "Ctrl",
    "<shift>": "Shift",
    "<alt>": "Alt",
    "<cmd>": "Cmd",
}

# 反向映射：人类可读格式 -> pynput 格式
_DISPLAY_TO_MODIFIER: dict[str, str] = {v: k for k, v in _MODIFIER_TO_DISPLAY.items()}


def pynput_to_display(pynput_fmt: str) -> str:
    """
    Business Logic（为什么需要这个函数）:
        用户在设置面板中看到的快捷键应该是人类可读格式（如 Ctrl+Shift+S），
        而程序内部使用 pynput 格式（如 <ctrl>+<shift>+s），需要进行转换。

    Code Logic（这个函数做什么）:
        将 pynput 格式字符串按 '+' 分割，将修饰键替换为可读名称，
        普通键转为大写，最后用 '+' 连接。
        示例: "<ctrl>+<shift>+s" -> "Ctrl+Shift+S"
    """
    parts: list[str] = pynput_fmt.split("+")
    result: list[str] = []
    for part in parts:
        part_stripped = part.strip()
        if part_stripped in _MODIFIER_TO_DISPLAY:
            result.append(_MODIFIER_TO_DISPLAY[part_stripped])
        else:
            # 普通键，转大写
            result.append(part_stripped.upper())
    return "+".join(result)


def display_to_pynput(display_fmt: str) -> str:
    """
    Business Logic（为什么需要这个函数）:
        用户选择的人类可读格式快捷键（如 Ctrl+Shift+S）需要转为
        pynput 可识别的格式（如 <ctrl>+<shift>+s）才能注册热键监听。

    Code Logic（这个函数做什么）:
        将人类可读格式字符串按 '+' 分割，将修饰键名称替换为 pynput 格式，
        普通键转为小写，最后用 '+' 连接。
        示例: "Ctrl+Shift+S" -> "<ctrl>+<shift>+s"
    """
    parts: list[str] = display_fmt.split("+")
    result: list[str] = []
    for part in parts:
        part_stripped = part.strip()
        if part_stripped in _DISPLAY_TO_MODIFIER:
            result.append(_DISPLAY_TO_MODIFIER[part_stripped])
        else:
            # 普通键，转小写
            result.append(part_stripped.lower())
    return "+".join(result)


# ── X11 辅助：pynput 格式修饰键 → Xlib modifier mask ──────────────────────
_PYNPUT_TO_X11_MODIFIER: dict[str, int] = {}
if sys.platform.startswith("linux"):
    _PYNPUT_TO_X11_MODIFIER = {
        "<ctrl>": X.ControlMask,
        "<shift>": X.ShiftMask,
        "<alt>": X.Mod1Mask,
    }

# NumLock / CapsLock 干扰掩码组合（XGrabKey 必须逐一注册）
_LOCK_MASKS: list[int] = []
if sys.platform.startswith("linux"):
    _LOCK_MASKS = [
        0,
        X.Mod2Mask,                     # NumLock
        X.LockMask,                     # CapsLock
        X.Mod2Mask | X.LockMask,        # NumLock + CapsLock
    ]


def _parse_hotkey(hotkey_str: str, disp: Display) -> tuple[int, int]:
    """
    Business Logic（为什么需要这个函数）:
        将用户配置的 pynput 格式快捷键字符串解析为 Xlib 可用的
        (modifier_mask, keycode) 二元组，供 XGrabKey 注册使用。

    Code Logic（这个函数做什么）:
        按 '+' 分割字符串，逐段识别修饰键（<ctrl>/<shift>/<alt>）和普通键，
        修饰键累加为 X11 modifier mask，普通键通过 XK.string_to_keysym →
        display.keysym_to_keycode 转为 keycode。
        示例: "<ctrl>+<shift>+s" -> (ControlMask | ShiftMask, keycode_for_s)
    """
    parts: list[str] = hotkey_str.split("+")
    modifier_mask: int = 0
    key_str: str = ""

    for part in parts:
        part = part.strip()
        if part in _PYNPUT_TO_X11_MODIFIER:
            modifier_mask |= _PYNPUT_TO_X11_MODIFIER[part]
        else:
            # 普通键（去掉 pynput 的尖括号，如有）
            key_str = part.strip("<>")

    if not key_str:
        raise ValueError(f"快捷键字符串中未找到普通键: {hotkey_str}")

    keysym: int = XK.string_to_keysym(key_str)
    if keysym == 0:
        raise ValueError(f"无法解析按键 '{key_str}' 的 keysym")

    keycode: int = disp.keysym_to_keycode(keysym)
    if keycode == 0:
        raise ValueError(f"无法获取按键 '{key_str}' 的 keycode")

    return modifier_mask, keycode


class GlobalHotkeyManager(QObject):
    """
    全局快捷键管理器。

    Business Logic（为什么需要这个类）:
        截图等功能需要在任何时候（即使窗口最小化）都能通过键盘快捷键触发，
        因此需要一个全局级别的键盘监听器。

    Code Logic（这个类做什么）:
        Linux 上使用 Xlib XGrabKey 实现真正的全局快捷键监听（pynput 在部分
        Linux 桌面环境下无法捕获键盘事件）；macOS/Windows 回退到 pynput 方案。
        监听线程通过 QTimer.singleShot(0, ...) 安全地将事件分发回 Qt 主线程。
    """

    hotkey_triggered = pyqtSignal(str)  # 动作名（如 "screenshot"）

    def __init__(self, hotkeys: dict[str, str] | None = None) -> None:
        """
        Business Logic（为什么需要这个函数）:
            管理器需要知道要监听哪些快捷键以及对应的动作名称。

        Code Logic（这个函数做什么）:
            初始化快捷键映射字典和内部状态。
            hotkeys 参数格式: {action_name: pynput_format_string}
            例如: {"screenshot": "<ctrl>+<shift>+s"}

            Linux 额外维护 X11 Display、监听线程、已注册的 grab 信息。
            macOS/Windows 维护 pynput listener 引用。
        """
        super().__init__()
        self._hotkeys: dict[str, str] = hotkeys or {}
        self._running: bool = False
        self._stop_event: threading.Event = threading.Event()

        # Linux X11 专用
        self._display: Display | None = None
        self._thread: threading.Thread | None = None
        # 已注册的 grab：{(modifier_mask, keycode): action_name}
        self._grabs: dict[tuple[int, int], str] = {}

        # macOS / Windows pynput 回退
        self._listener: _pynput_keyboard.GlobalHotKeys | None = None  # type: ignore[name-defined]

    # ── 公共 API ─────────────────────────────────────────────────────────

    def start(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            应用启动或用户修改快捷键后，需要开始监听全局键盘事件。

        Code Logic（这个函数做什么）:
            根据平台选择监听方案：
            - Linux: 创建 X11 Display，为每个快捷键调用 XGrabKey（含
              NumLock/CapsLock 组合），启动后台线程轮询 X 事件。
            - macOS/Windows: 使用 pynput GlobalHotKeys 启动监听。
        """
        if self._running or not self._hotkeys:
            return

        if sys.platform.startswith("linux"):
            self._start_x11()
        else:
            self._start_pynput()

    def stop(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            应用退出或用户修改快捷键时，需要停止当前的监听。

        Code Logic（这个函数做什么）:
            根据平台选择停止方案：
            - Linux: 设置停止事件、UngrabKey、关闭 Display、等待线程结束。
            - macOS/Windows: 停止 pynput 监听线程。
        """
        if not self._running:
            return

        if sys.platform.startswith("linux"):
            self._stop_x11()
        else:
            self._stop_pynput()

    def update_hotkey(self, action: str, new_combo: str) -> None:
        """
        Business Logic（为什么需要这个函数）:
            用户在设置面板中修改快捷键后，需要即时生效而不必重启应用。

        Code Logic（这个函数做什么）:
            更新指定动作的快捷键组合，如果监听器正在运行则重启以应用新配置。
        """
        self._hotkeys[action] = new_combo
        if self._running:
            self.stop()
            self.start()

    # ── Linux X11 实现 ───────────────────────────────────────────────────

    def _start_x11(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            Linux 环境下 pynput 无法可靠捕获键盘事件，需要用 Xlib XGrabKey
            直接向 X Server 注册全局快捷键。

        Code Logic（这个函数做什么）:
            1. 打开 X11 Display 连接
            2. 解析每个快捷键为 (modifier_mask, keycode)
            3. 对每个快捷键注册 4 种 Lock 掩码组合的 XGrabKey
            4. 启动后台守护线程轮询 X 事件
        """
        try:
            self._display = xdisplay.Display()
            root = self._display.screen().root
            self._grabs.clear()
            self._stop_event.clear()

            for action, combo in self._hotkeys.items():
                try:
                    mask, keycode = _parse_hotkey(combo, self._display)
                    self._grabs[(mask, keycode)] = action

                    # 同时注册 NumLock / CapsLock 的组合，否则开启时快捷键失效
                    for lock_mask in _LOCK_MASKS:
                        root.grab_key(
                            keycode,
                            mask | lock_mask,
                            True,               # owner_events
                            X.GrabModeAsync,
                            X.GrabModeAsync,
                        )
                    logger.info("X11 GrabKey 注册成功: %s -> %s", combo, action)
                except Exception as e:
                    logger.error("X11 GrabKey 注册失败 (%s): %s", combo, e)

            if not self._grabs:
                logger.error("没有任何快捷键注册成功，放弃启动 X11 监听")
                self._display.close()
                self._display = None
                return

            self._running = True
            self._thread = threading.Thread(
                target=self._run_x11_listener,
                name="x11-hotkey-listener",
                daemon=True,
            )
            self._thread.start()
            logger.info("X11 全局快捷键监听已启动: %s", self._hotkeys)

        except Exception as e:
            logger.error("X11 全局快捷键启动失败: %s", e)
            self._running = False
            if self._display is not None:
                self._display.close()
                self._display = None

    def _run_x11_listener(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            需要在后台线程持续监听 X11 事件，将匹配的快捷键事件转发到 Qt 主线程。

        Code Logic（这个函数做什么）:
            循环检查 display.pending_events()，有事件时取出并判断是否为 KeyPress；
            匹配到已注册的 (modifier_mask, keycode) 后通过 QTimer.singleShot(0, ...)
            安全回到 Qt 主线程发射信号。匹配时需要去除 NumLock/CapsLock 位。
            无事件时 sleep(0.05) 避免空转。
        """
        # 需要清除的 lock 位掩码
        clean_mask: int = ~(X.Mod2Mask | X.LockMask) & 0xFF

        while not self._stop_event.is_set():
            try:
                if self._display is None:
                    break

                pending: int = self._display.pending_events()
                if pending > 0:
                    event = self._display.next_event()
                    if event.type == X.KeyPress:
                        # 去除 NumLock / CapsLock 干扰
                        state: int = event.state & clean_mask
                        keycode: int = event.detail
                        key_tuple: tuple[int, int] = (state, keycode)

                        action: str | None = self._grabs.get(key_tuple)
                        if action is not None:
                            logger.info("快捷键触发: %s", action)
                            # 闭包捕获 action 值
                            act: str = action
                            QTimer.singleShot(
                                0, lambda a=act: self.hotkey_triggered.emit(a)
                            )
                else:
                    time.sleep(0.05)

            except Exception as e:
                if not self._stop_event.is_set():
                    logger.error("X11 事件监听异常: %s", e)
                break

    def _stop_x11(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            停止 X11 监听时需要释放所有 GrabKey 并关闭 Display，防止资源泄漏。

        Code Logic（这个函数做什么）:
            1. 设置 _stop_event 通知监听线程退出
            2. 对每个已注册的 keycode/mask 组合调用 ungrab_key
            3. 关闭 Display 连接
            4. 等待监听线程结束（最多 2 秒）
        """
        self._stop_event.set()
        self._running = False

        if self._display is not None:
            try:
                root = self._display.screen().root
                for (mask, keycode) in self._grabs:
                    for lock_mask in _LOCK_MASKS:
                        root.ungrab_key(keycode, mask | lock_mask)
                self._display.close()
            except Exception as e:
                logger.error("X11 资源清理异常: %s", e)
            finally:
                self._display = None
                self._grabs.clear()

        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None

        logger.info("X11 全局快捷键监听已停止")

    # ── macOS / Windows pynput 回退 ──────────────────────────────────────

    def _start_pynput(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            macOS / Windows 不支持 Xlib，需要使用 pynput 作为回退方案
            实现全局快捷键监听。

        Code Logic（这个函数做什么）:
            根据 _hotkeys 字典构建 pynput GlobalHotKeys 的 bindings，
            为每个动作创建闭包回调，回调中使用 QTimer.singleShot(0, ...)
            将信号发射安全地调度到 Qt 主线程。
        """
        self._running = True
        bindings: dict[str, callable] = {}
        for action, combo in self._hotkeys.items():
            def make_callback(act: str) -> callable:
                """
                Business Logic（为什么需要这个函数）:
                    每个快捷键需要独立的回调函数，闭包确保 action 名称正确绑定。

                Code Logic（这个函数做什么）:
                    创建并返回一个闭包回调函数，该回调在被 pynput 后台线程调用时，
                    通过 QTimer.singleShot(0, ...) 安全地在 Qt 主线程发射信号。
                """
                def cb() -> None:
                    logger.info("快捷键触发: %s", act)
                    QTimer.singleShot(0, lambda: self.hotkey_triggered.emit(act))
                return cb
            bindings[combo] = make_callback(action)

        try:
            self._listener = keyboard.GlobalHotKeys(bindings)
            self._listener.start()
            logger.info("pynput 全局快捷键监听已启动: %s", self._hotkeys)
        except Exception as e:
            logger.error("pynput 全局快捷键启动失败: %s", e)
            self._running = False

    def _stop_pynput(self) -> None:
        """
        Business Logic（为什么需要这个函数）:
            应用退出或用户修改快捷键时，需要停止 pynput 监听并释放资源。

        Code Logic（这个函数做什么）:
            停止 pynput 监听线程并清理引用，将运行状态标记为 False。
        """
        self._running = False
        if self._listener is not None:
            self._listener.stop()
            self._listener = None
            logger.info("pynput 全局快捷键监听已停止")
