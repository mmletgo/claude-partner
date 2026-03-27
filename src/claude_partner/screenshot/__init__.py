# -*- coding: utf-8 -*-
"""截图模块：提供区域截图和截图管理功能。"""

from claude_partner.screenshot.capture import ScreenshotManager
from claude_partner.screenshot.overlay import ScreenshotOverlay

__all__: list[str] = ["ScreenshotManager", "ScreenshotOverlay"]
