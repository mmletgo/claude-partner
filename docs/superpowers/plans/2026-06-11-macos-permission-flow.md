# macOS 权限授权流程闭环 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development 逐 task 执行本计划。Steps 用 `- [ ]` 复选框跟踪。

**Goal:** 把"获取 macOS 权限"功能从死路由/断按钮状态,改造成「首次启动 Welcome 引导 + 侧栏底部常驻状态徽标 + 点击触发系统授权弹窗并打开设置面板 + 轮询确认」的完整闭环。

**Architecture:** 后端 `permissions.py` 新增 `request_screen_capture_access()`(调 `CGRequestScreenCaptureAccess`)与 `open_permission_settings(perm_type)`(`subprocess open` 系统设置 URL scheme),经新端点 `POST /api/permissions/request` 暴露;前端新增 `usePermissions` hook 统一轮询 + 请求,`Welcome` 接通请求按钮并写入"已引导"标记,`OnboardingGuard` 首次启动跳转 Welcome,`PermissionStatusBadge` 在侧栏底部常驻兜底。

**Tech Stack:** 后端 Python 3 + aiohttp + pyobjc Quartz;前端 React 19 + TypeScript + react-router-dom + react-i18next。

---

## 关键约定(所有 task 共享)

- **localStorage key**:`'cp-permission-onboarded'`,字符串 `'1'` 表示已完成首次引导。该常量定义在 `web/src/hooks/usePermissions.ts` 并 `export`,Welcome 与 OnboardingGuard **必须从此处 import**,不得各自硬编码。
- **权限类型字符串**:`'screenCapture'` 与 `'inputMonitoring'`(与后端 `check` 返回字段名一致),定义 `PermissionType` 类型于 `web/src/lib/types.ts`。
- **后端 macOS 系统设置 URL scheme**:
  - 屏幕录制:`x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`
  - 输入监控:`x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent`
- **frozen 守卫不变**:`check_screen_capture_access` / `check_input_monitoring_access` 保持现有 `not frozen → True` 行为(开发环境权限恒显示已授权)。因此 **Welcome/Guard/Badge 在开发环境(`npm run dev` + 直接跑 python)不会触发**,真实授权弹窗流程需 **PyInstaller 打包后的 .app** 才能验证。`request_*` / `open_*` 新函数**不受 frozen 限制**,只要 `sys.platform == "darwin"` 即真实工作(便于在 mac 上直接调测后端)。

## 测试策略(现实约束)

- **前端无单元测试基建**(package.json 仅有 `build`(tsc 类型检查)/`lint`/Playwright E2E,无 vitest/jest)。前端验证 = `npm run build`(tsc + i18n key 校验,类型错/key 拼错即失败)+ `npm run lint` + 手动核对。
- **后端**有 pytest + pytest-asyncio(`testpaths=["tests"]`)但无实际测试文件。本计划为新增的纯函数补单元测试。
- 因此本计划**不对前端组件写 TDD**(无基建),只对后端纯函数 TDD。前端以类型/lint/构建为安全网。

## File Structure

### 后端(创建/修改)
- Modify `src/claude_partner/ui/permissions.py` — 新增 `request_screen_capture_access()`、`open_permission_settings(perm_type)`、`_PERMISSION_SETTINGS_URLS` 常量;顶部加 `import subprocess`
- Create `tests/__init__.py`(空) + `tests/test_permissions.py` — permissions 纯函数单测
- Modify `src/claude_partner/network/protocol.py` — `__init__` 加 `request_permissions` 回调;`setup_routes` 注册 `POST /api/permissions/request`;新增 `handle_permissions_request`
- Modify `src/claude_partner/app.py` — 新增 `_request_permissions(perm_type)` 方法 + 注入到 `APIProtocol`
- Modify `src/claude_partner/ui/CLAUDE.md`、`src/claude_partner/network/CLAUDE.md` — 更新功能说明

### 前端(创建/修改)
- Modify `web/src/lib/types.ts` — 新增 `PermissionType`、`PermissionRequestResult`
- Modify `web/src/api/config.ts` — 新增 `requestPermission(type)`
- Create `web/src/hooks/usePermissions.ts` — 轮询 + 请求 hook,导出 `PERMISSION_ONBOARDED_KEY`
- Modify `web/src/App.tsx` — 新增 `OnboardingGuard` 组件并包裹 AppShell 路由
- Modify `web/src/pages/Welcome/Welcome.tsx` — 删通知卡 + 接通 `onRequestAccess` + 写 localStorage 标记
- Create `web/src/components/domain/PermissionStatusBadge/{PermissionStatusBadge.tsx,.module.css,index.ts}` — 侧栏底部状态徽标
- Modify `web/src/components/domain/index.ts` — 导出 `PermissionStatusBadge`
- Modify `web/src/components/layout/AppShell/AppShell.tsx` — 在 Sidebar 内集成徽标
- Modify `web/src/i18n/locales/{en,zh}/welcome.json` — 删 `permission.notifications` 块
- Modify `web/src/i18n/locales/{en,zh}/common.json` — 新增 `permission` 块
- Modify `web/CLAUDE.md` — hooks 列表加 `usePermissions` + 权限流程说明

---

## Task 1: 后端 permissions.py 新增请求/打开设置函数(TDD)

**Files:**
- Modify: `src/claude_partner/ui/permissions.py`(顶部加 import,文件末尾追加 3 个符号)
- Test: `tests/__init__.py`, `tests/test_permissions.py`

- [ ] **Step 1: 写失败测试**

创建 `tests/__init__.py`(空文件)与 `tests/test_permissions.py`:

```python
# -*- coding: utf-8 -*-
"""ui.permissions 模块单元测试。"""
from __future__ import annotations

import sys
import types

from claude_partner.ui import permissions


def test_check_non_darwin_returns_true(monkeypatch):
    """非 macOS 环境 check 函数视为已授权。"""
    monkeypatch.setattr(sys, "platform", "linux")
    assert permissions.check_screen_capture_access() is True
    assert permissions.check_input_monitoring_access() is True


def test_request_non_darwin_returns_false(monkeypatch):
    """非 macOS 环境 request 直接返回 False。"""
    monkeypatch.setattr(sys, "platform", "linux")
    assert permissions.request_screen_capture_access() is False


def test_request_darwin_calls_cgrequest(monkeypatch):
    """macOS 下调用 Quartz.CGRequestScreenCaptureAccess。"""
    monkeypatch.setattr(sys, "platform", "darwin")
    fake_quartz = types.SimpleNamespace(
        CGRequestScreenCaptureAccess=lambda: True,
    )
    monkeypatch.setitem(sys.modules, "Quartz", fake_quartz)
    assert permissions.request_screen_capture_access() is True


def test_request_darwin_without_quartz_returns_false(monkeypatch):
    """macOS 但 Quartz 不可用时安全返回 False。"""
    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setitem(sys.modules, "Quartz", None)
    assert permissions.request_screen_capture_access() is False


def test_open_settings_non_darwin_returns_false(monkeypatch):
    monkeypatch.setattr(sys, "platform", "linux")
    assert permissions.open_permission_settings("screenCapture") is False


def test_open_settings_unknown_type_returns_false(monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    assert permissions.open_permission_settings("unknown") is False


def test_open_settings_darwin_calls_subprocess(monkeypatch):
    """macOS 下对已知类型调用 subprocess.Popen(['open', url])。"""
    monkeypatch.setattr(sys, "platform", "darwin")
    captured: dict = {}

    class FakePopen:
        def __init__(self, cmd):
            captured["cmd"] = cmd

    monkeypatch.setattr(permissions.subprocess, "Popen", FakePopen)
    assert permissions.open_permission_settings("screenCapture") is True
    assert captured["cmd"] == [
        "open",
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    ]

    assert permissions.open_permission_settings("inputMonitoring") is True
    assert "Privacy_ListenEvent" in captured["cmd"][1]
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/hans/python_project/claude-partner && python -m pytest tests/test_permissions.py -v`
Expected: FAIL(`AttributeError: module ... has no attribute 'request_screen_capture_access'` 等)

- [ ] **Step 3: 实现 permissions.py**

在 `src/claude_partner/ui/permissions.py` 顶部,把:

```python
from __future__ import annotations

import sys
```

改为:

```python
from __future__ import annotations

import subprocess
import sys
```

在文件末尾(`check_input_monitoring_access` 函数之后)追加:

```python

# 权限类型 → macOS「系统设置 → 隐私与安全」对应面板的 URL scheme
_PERMISSION_SETTINGS_URLS: dict[str, str] = {
    "screenCapture": (
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    ),
    "inputMonitoring": (
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
    ),
}


def request_screen_capture_access() -> bool:
    """
    Business Logic（为什么需要这个函数）:
        屏幕录制权限需要主动请求以触发系统授权弹窗（首次使用时），
        供前端「去设置/请求授权」流程调用，避免用户不知道要去哪里开启。

    Code Logic（这个函数做什么）:
        调用 Quartz.CGRequestScreenCaptureAccess()（macOS 10.15+）。
        非 macOS 返回 False；Quartz 不可用或无该 API 时返回 False。
        注意：该 API 仅在「未决定」状态下弹系统对话框，已被用户拒绝时
        直接返回 False 且不再弹窗，此时需配合 open_permission_settings
        引导用户到设置面板手动开启。
    """
    if sys.platform != "darwin":
        return False
    try:
        import Quartz  # type: ignore[import-untyped]
        if hasattr(Quartz, "CGRequestScreenCaptureAccess"):
            return bool(Quartz.CGRequestScreenCaptureAccess())  # type: ignore[attr-defined]
    except ImportError:
        pass
    return False


def open_permission_settings(perm_type: str) -> bool:
    """
    Business Logic（为什么需要这个函数）:
        用户需要手动在「系统设置 → 隐司与安全」中开启对应权限，
        本函数直接打开对应面板，免去用户手动查找，提升授权转化。

    Code Logic（这个函数做什么）:
        通过 subprocess.Popen 非阻塞调用 `open <url-scheme>` 打开面板。
        仅 macOS 生效；未知 perm_type 或非 macOS 返回 False。
    """
    if sys.platform != "darwin":
        return False
    url: str | None = _PERMISSION_SETTINGS_URLS.get(perm_type)
    if not url:
        return False
    try:
        subprocess.Popen(["open", url])
        return True
    except Exception:
        return False
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/hans/python_project/claude-partner && python -m pytest tests/test_permissions.py -v`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add src/claude_partner/ui/permissions.py tests/__init__.py tests/test_permissions.py
git commit -m "feat(permissions): 新增屏幕录制授权请求与打开系统设置面板函数"
```

---

## Task 2: 后端暴露 POST /api/permissions/request 端点

**Files:**
- Modify: `src/claude_partner/network/protocol.py`(`__init__` 签名 ~57-76、保存 ~105、`setup_routes` ~170、`__init__` docstring ~77-89、新增 handler 紧邻 `handle_permissions` 之后 ~944)
- Modify: `src/claude_partner/app.py`(注入 ~124-141、新增方法 ~473 之后)

- [ ] **Step 1: protocol.py `__init__` 加回调参数**

在 `src/claude_partner/network/protocol.py` 的 `__init__` 形参列表中,把:

```python
        check_permissions: Callable[[], dict] | None = None,
        actual_port: int = 0,
```

改为:

```python
        check_permissions: Callable[[], dict] | None = None,
        request_permissions: Callable[[str], dict] | None = None,
        actual_port: int = 0,
```

- [ ] **Step 2: protocol.py `__init__` 保存回调**

把保存语句:

```python
        self._check_permissions: Callable[[], dict] | None = check_permissions
        self._actual_port: int = actual_port
```

改为:

```python
        self._check_permissions: Callable[[], dict] | None = check_permissions
        self._request_permissions: Callable[[str], dict] | None = request_permissions
        self._actual_port: int = actual_port
```

并在 `__init__` docstring 的 `- check_permissions: 检查 macOS 权限状态` 这一行之后补一行:

```
            - request_permissions: 触发 macOS 权限请求并打开设置面板（参数 perm_type）
```

- [ ] **Step 3: protocol.py setup_routes 注册路由**

在 `setup_routes` 中,把:

```python
        # 前端 REST - 权限检查
        app.router.add_get("/api/permissions", self.handle_permissions)
```

改为:

```python
        # 前端 REST - 权限检查 / 请求
        app.router.add_get("/api/permissions", self.handle_permissions)
        app.router.add_post("/api/permissions/request", self.handle_permissions_request)
```

并在类顶部 docstring(`/api/permissions: 检查 macOS 权限状态` 一行)之后补:

```
        - /api/permissions/request (POST): 触发 macOS 权限请求并打开设置面板
```

- [ ] **Step 4: protocol.py 新增 handler**

在 `handle_permissions` 方法结束之后(即文件中 `handle_permissions` 的 `return web.json_response({"error": str(e)}, status=500)` 之后),新增:

```python

    async def handle_permissions_request(self, request: web.Request) -> web.Response:
        """
        Business Logic:
            前端「去设置/请求授权」流程需要后端触发 macOS 系统授权弹窗
            并打开对应设置面板，引导用户开启屏幕录制/输入监控权限。

        Code Logic:
            解析 body 中的 type（screenCapture/inputMonitoring），校验后
            调用注入的 request_permissions 回调（CGRequest + open 设置面板），
            返回 {ok, requested, opened}。回调未注册返回 501，未知类型返回 400。
        """
        if self._request_permissions is None:
            return web.json_response(
                {"error": "权限请求功能未启用"}, status=501
            )
        try:
            body: dict = await request.json()
            perm_type: str = str(body.get("type", ""))
            if perm_type not in ("screenCapture", "inputMonitoring"):
                return web.json_response(
                    {"error": f"未知权限类型: {perm_type}"}, status=400
                )
            result: dict = self._request_permissions(perm_type)
            return web.json_response(result)
        except Exception as e:
            logger.error("handle_permissions_request 异常: %s", e, exc_info=True)
            return web.json_response({"error": str(e)}, status=500)
```

- [ ] **Step 5: app.py 新增 `_request_permissions` 方法**

在 `src/claude_partner/app.py` 的 `_check_permissions_status` 方法之后(其 `return {...}` 结束之后),新增:

```python

    @staticmethod
    def _request_permissions(perm_type: str) -> dict:
        """
        Business Logic:
            前端授权流程需要触发 macOS 系统授权弹窗并打开对应设置面板，
            让用户完成屏幕录制/输入监控权限的授予。

        Code Logic:
            screenCapture 先调用 request_screen_capture_access 触发系统弹窗，
            再调用 open_permission_settings 打开设置面板；inputMonitoring
            仅打开设置面板。返回 {ok, requested, opened}，非 macOS 相应字段为 False。
        """
        from claude_partner.ui.permissions import (
            open_permission_settings,
            request_screen_capture_access,
        )
        requested: bool = False
        if perm_type == "screenCapture":
            requested = request_screen_capture_access()
        opened: bool = open_permission_settings(perm_type)
        return {"ok": True, "requested": requested, "opened": opened}
```

- [ ] **Step 6: app.py 注入回调**

在 `APIProtocol(...)` 构造调用中,把:

```python
            check_permissions=self._check_permissions_status,
        )
```

改为:

```python
            check_permissions=self._check_permissions_status,
            request_permissions=self._request_permissions,
        )
```

- [ ] **Step 7: 启动后端冒烟测试端点**

Run: `cd /Users/hans/python_project/claude-partner && python -c "import asyncio; from claude_partner.network.protocol import APIProtocol; from claude_partner.config import AppConfig; from claude_partner.storage.prompt_repo import PromptRepository" 2>&1 | head` (确认 import 无语法错)

然后启动应用(若可):确认日志无异常,并手动用 curl 验证(端口见 `~/.claude-partner/backend.port`):

```bash
PORT=$(cat ~/.claude-partner/backend.port 2>/dev/null) && \
curl -s -X POST "http://127.0.0.1:$PORT/api/permissions/request" -H 'Content-Type: application/json' -d '{"type":"screenCapture"}'
```
Expected(macos):`{"ok":true,"requested":<bool>,"opened":true}` 并弹出系统设置面板
Expected(未知类型):`{"error":"未知权限类型: bad"}` + 400

- [ ] **Step 8: 更新后端 CLAUDE.md**

`src/claude_partner/network/CLAUDE.md`:在前端 REST 端点列表的 `GET /api/permissions` 一行后补 `POST /api/permissions/request: 触发 macOS 权限请求并打开设置面板`;在构造参数 `check_permissions` 一行后补 `request_permissions: macOS 权限请求回调(触发授权弹窗+打开设置面板,参数 perm_type)`。

`src/claude_partner/ui/CLAUDE.md`:在「权限检查 (permissions.py)」小节末尾补:
- `request_screen_capture_access() -> bool`:Quartz.CGRequestScreenCaptureAccess 触发屏幕录制授权弹窗(macOS 10.15+,仅"未决定"状态弹窗)
- `open_permission_settings(perm_type) -> bool`:`subprocess open` 打开「系统设置→隐私与安全」对应面板(screenCapture/inputMonitoring)

- [ ] **Step 9: Commit**

```bash
git add src/claude_partner/network/protocol.py src/claude_partner/app.py src/claude_partner/network/CLAUDE.md src/claude_partner/ui/CLAUDE.md
git commit -m "feat(api): 新增 POST /api/permissions/request 触发授权请求并打开系统设置"
```

---

## Task 3: 前端 API client + 类型 + usePermissions hook

**Files:**
- Modify: `web/src/lib/types.ts`(末尾追加)
- Modify: `web/src/api/config.ts`(import + 方法)
- Create: `web/src/hooks/usePermissions.ts`

- [ ] **Step 1: types.ts 新增类型**

在 `web/src/lib/types.ts` 末尾(`PermissionsStatus` 之后)追加:

```ts

export type PermissionType = 'screenCapture' | 'inputMonitoring';

export interface PermissionRequestResult {
  ok: boolean;
  /** 是否触发了系统授权弹窗（仅 screenCapture 且首次可能为 true） */
  requested: boolean;
  /** 是否成功打开了系统设置面板 */
  opened: boolean;
  error?: string;
}
```

- [ ] **Step 2: config.ts 加 API 方法**

把 `web/src/api/config.ts` 顶部 import:

```ts
import type {
  AppConfig,
  VersionInfo,
  UpdateCheckResult,
  UpdateDownloadStatus,
  PermissionsStatus,
} from '@/lib/types';
```

改为:

```ts
import type {
  AppConfig,
  VersionInfo,
  UpdateCheckResult,
  UpdateDownloadStatus,
  PermissionsStatus,
  PermissionType,
  PermissionRequestResult,
} from '@/lib/types';
```

并把 `configApi` 对象末尾的 `permissions` 方法之后补一个方法(注意保留闭合 `}`):

```ts
  /** 检查 macOS 权限状态（屏幕录制、输入监控） */
  permissions: () => api.get<PermissionsStatus>('/api/permissions'),

  /** 触发权限请求（弹系统授权框 + 打开设置面板） */
  requestPermission: (type: PermissionType) =>
    api.post<PermissionRequestResult>('/api/permissions/request', { type }),
```

- [ ] **Step 3: 新建 usePermissions hook**

创建 `web/src/hooks/usePermissions.ts`(参考 `useAppVersion`/`useLanguage` 的范式与注释风格):

```ts
/**
 * usePermissions - macOS 权限状态轮询与请求
 *
 * Business Logic（为什么需要这个 hook）:
 *   Welcome 引导页和侧栏底部授权徽标都需要：持续获取屏幕录制/输入监控权限
 *   状态、并在用户点击「请求授权」时触发后端弹系统授权框 + 打开设置面板。
 *   把轮询、请求、就绪判定收敛到一个 hook，避免 Welcome 与徽标各写一套重复逻辑。
 *
 * Code Logic（这个 hook 做什么）:
 *   - 每 2s 调用 configApi.permissions() 轮询，更新 status
 *   - stopWhenGranted=true 时，全部授权后自动停止轮询（Welcome 用）
 *   - requestMissing() 对所有未授权权限调用 configApi.requestPermission，随后立即刷新
 *   - 暴露 status / loading / allGranted / requestMissing / refresh
 *   - 导出 PERMISSION_ONBOARDED_KEY 供 OnboardingGuard 与 Welcome 共享
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { configApi } from '@/api/config';
import type { PermissionType, PermissionsStatus } from '@/lib/types';

/** localStorage key：标记已完成首次权限引导，避免每次启动都跳 Welcome */
export const PERMISSION_ONBOARDED_KEY = 'cp-permission-onboarded';

const POLL_INTERVAL = 2000;

export interface UsePermissionsResult {
  status: PermissionsStatus | null;
  loading: boolean;
  allGranted: boolean;
  /** 请求所有未授权的权限（触发系统弹窗/打开设置面板），完成后刷新 */
  requestMissing: () => Promise<void>;
  /** 手动刷新一次权限状态 */
  refresh: () => Promise<void>;
}

/**
 * 权限状态轮询与请求 hook
 *
 * @param options.stopWhenGranted 全部授权后停止轮询（Welcome 页用 true，侧栏徽标用 false 持续兜底）
 * @returns status / loading / allGranted / requestMissing / refresh
 */
export function usePermissions(
  options: { stopWhenGranted?: boolean } = {},
): UsePermissionsResult {
  const { stopWhenGranted = false } = options;
  const [status, setStatus] = useState<PermissionsStatus | null>(null);
  const statusRef = useRef<PermissionsStatus | null>(null);
  statusRef.current = status;

  const refresh = useCallback(async () => {
    try {
      const s = await configApi.permissions();
      setStatus(s);
    } catch {
      // 接口失败保持当前状态，下轮重试
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const poll = async () => {
      await refresh();
      const current = statusRef.current;
      if (!current) return;
      const done = current.screenCapture.granted && current.inputMonitoring.granted;
      if (done && stopWhenGranted && !stopped) {
        stopped = true;
        if (timer) {
          window.clearInterval(timer);
          timer = null;
        }
      }
    };

    void poll();
    timer = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL);

    return () => {
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [refresh, stopWhenGranted]);

  const requestMissing = useCallback(async () => {
    const current = statusRef.current;
    const types: PermissionType[] = [];
    if (current && !current.screenCapture.granted) types.push('screenCapture');
    if (current && !current.inputMonitoring.granted) types.push('inputMonitoring');
    if (types.length === 0) return;
    await Promise.all(types.map((t) => configApi.requestPermission(t)));
    await refresh();
  }, [refresh]);

  const allGranted =
    !!status && status.screenCapture.granted && status.inputMonitoring.granted;

  return { status, loading: status === null, allGranted, requestMissing, refresh };
}
```

- [ ] **Step 4: 类型检查**

Run: `cd /Users/hans/python_project/claude-partner/web && npm run build`
Expected: 构建成功(tsc 无错)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/types.ts web/src/api/config.ts web/src/hooks/usePermissions.ts
git commit -m "feat(web): 新增 usePermissions hook 与权限请求 API 客户端"
```

---

## Task 4: Welcome 页改造(删通知卡 + 接通请求 + 写标记)

**Files:**
- Modify: `web/src/pages/Welcome/Welcome.tsx`(整体重写)
- Modify: `web/src/i18n/locales/zh/welcome.json`、`web/src/i18n/locales/en/welcome.json`

- [ ] **Step 1: 删除 welcome.json 的 notifications 块**

在 `web/src/i18n/locales/zh/welcome.json` 中,删除 `permission` 对象里的:

```json
    "notifications": {
      "title": "通知权限",
      "description": "允许发送系统通知"
    }
```

(注意修好前一个 `inputMonitoring` 描述行末尾的逗号,使 JSON 合法:`"description": "允许全局快捷键"` 后无逗号)。

同样在 `web/src/i18n/locales/en/welcome.json` 删除:

```json
    "notifications": {
      "title": "Notifications",
      "description": "Allow sending system notifications"
    }
```

(修好 `"description": "Allow global keyboard shortcuts"` 行尾逗号)。

- [ ] **Step 2: 重写 Welcome.tsx**

把 `web/src/pages/Welcome/Welcome.tsx` **整体替换**为(删除自写的轮询/mapPermissions 逻辑,改用 `usePermissions`):

```tsx
/**
 * Welcome 欢迎/权限引导页
 *
 * Business Logic（为什么需要这个页面）:
 *   macOS 等系统要求桌面工具在首次使用前明确申请「屏幕录制 / 输入监控」等
 *   敏感权限，否则后续功能（截图、全局快捷键）会静默失败。Welcome 页在路由层
 *   独立于 AppShell（不进入主窗口），给首次使用的用户一个「先授权再用」的引导。
 *
 * Code Logic（这个页面做什么）:
 *   - 全屏深色背景模拟 macOS 权限弹窗，居中 Window 容器展示 logo/标题/权限卡/CTA
 *   - 两条权限卡：屏幕录制 / 输入监控（通知权限已移除，本项目无系统通知功能）
 *   - 用 usePermissions({ stopWhenGranted: true }) 轮询，全部授权后自动停止
 *   - PermissionCard 的「去设置」点击 → requestMissing()（弹系统授权框 + 打开设置面板）
 *   - 「继续使用」/「暂时跳过」都会写入 PERMISSION_ONBOARDED_KEY 后导航到首页，
 *     避免每次启动重复跳转
 *   - 所有 hooks 集中在组件顶部，early return 之前
 */

import { useCallback, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/primitives';
import { PermissionCard } from '@/components/domain';
import { configApi } from '@/api/config';
import { usePermissions, PERMISSION_ONBOARDED_KEY } from '@/hooks/usePermissions';
import type { PermissionsStatus } from '@/lib/types';
import {
  InfoIcon,
  KeyboardIcon,
  ArrowRightIcon,
} from '@/lib/icons';
import styles from './Welcome.module.css';

/** 单条权限条目的展示格式 */
interface PermissionEntry {
  id: string;
  icon: ReactElement;
  title: string;
  description: string;
  granted: boolean;
}

/**
 * 将后端 PermissionsStatus 转换为 PermissionEntry 列表（屏幕录制 + 输入监控）
 *
 * @param status - 后端返回的权限状态
 * @param t - i18next 翻译函数（welcome ns）
 * @returns 用于渲染的权限条目数组
 */
function mapPermissions(status: PermissionsStatus, t: TFunction<'welcome'>): PermissionEntry[] {
  return [
    {
      id: 'screenCapture',
      icon: <InfoIcon />,
      title: t('permission.screenRecording.title'),
      description: t('permission.screenRecording.description'),
      granted: status.screenCapture.granted,
    },
    {
      id: 'inputMonitoring',
      icon: <KeyboardIcon />,
      title: t('permission.inputMonitoring.title'),
      description: t('permission.inputMonitoring.description'),
      granted: status.inputMonitoring.granted,
    },
  ];
}

/**
 * Welcome 页面根组件
 */
export function Welcome() {
  const { t } = useTranslation(['welcome']);
  const navigate = useNavigate();
  const { status, loading, allGranted, requestMissing } = usePermissions({
    stopWhenGranted: true,
  });

  const finishOnboarding = useCallback(() => {
    localStorage.setItem(PERMISSION_ONBOARDED_KEY, '1');
    navigate('/');
  }, [navigate]);

  // loading：首次 API 请求尚未返回
  if (loading || !status) {
    return (
      <div className={styles.backdrop}>
        <div className={styles.window} role="dialog" aria-label={t('title')}>
          <div className={styles.brand} aria-hidden="true">
            CP
          </div>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.subtitle}>{t('checkingPermission')}</p>
        </div>
      </div>
    );
  }

  const entries = mapPermissions(status, t);

  return (
    <div className={styles.backdrop}>
      <div className={styles.window} role="dialog" aria-label={t('title')}>
        <div className={styles.brand} aria-hidden="true">
          CP
        </div>

        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>

        <div className={styles.permissionList} aria-label={t('permissionListAriaLabel')}>
          {entries.map((p) => (
            <PermissionCard
              key={p.id}
              icon={p.icon}
              title={p.title}
              description={p.description}
              granted={p.granted}
              onRequestAccess={() => {
                void requestMissing();
              }}
            />
          ))}
        </div>

        <footer className={styles.footer}>
          <span className={styles.hint}>
            {allGranted ? t('permissionReady') : t('waitingPermission')}
          </span>
          <div className={styles.actions}>
            <Button variant="ghost" size="md" onClick={finishOnboarding}>
              {t('skip')}
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={!allGranted}
              onClick={finishOnboarding}
              iconRight={<ArrowRightIcon />}
            >
              {t('continue')}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default Welcome;
```

> 说明:`AlertIcon` import 已移除(原用于 notifications 卡)。`useEffect`/`useState`/`useRef` 不再直接使用,改由 `usePermissions` 封装。

- [ ] **Step 3: 类型检查 + lint**

Run: `cd /Users/hans/python_project/claude-partner/web && npm run build && npm run lint`
Expected: 构建成功,lint 无错(若 lint 报 `useCallback` deps 警告,确认 `finishOnboarding` 依赖正确;`onRequestAccess` 内联箭头在 `.map` 中可接受,如 lint 报规则则抽为独立 `useCallback`)

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/Welcome/Welcome.tsx web/src/i18n/locales/zh/welcome.json web/src/i18n/locales/en/welcome.json
git commit -m "feat(welcome): Welcome 改用 usePermissions，删除通知卡，接通授权请求与引导标记"
```

---

## Task 5: 侧栏底部 PermissionStatusBadge 徽标 + 集成

**Files:**
- Create: `web/src/components/domain/PermissionStatusBadge/PermissionStatusBadge.tsx`
- Create: `web/src/components/domain/PermissionStatusBadge/PermissionStatusBadge.module.css`
- Create: `web/src/components/domain/PermissionStatusBadge/index.ts`
- Modify: `web/src/components/domain/index.ts`
- Modify: `web/src/components/layout/AppShell/AppShell.tsx`
- Modify: `web/src/i18n/locales/zh/common.json`、`web/src/i18n/locales/en/common.json`

- [ ] **Step 1: common.json 新增 permission 文案**

在 `web/src/i18n/locales/zh/common.json` 的顶层对象内(例如 `tag` 块之后)新增(注意 JSON 逗号):

```json
  "permission": {
    "needsGrant": "需要授权",
    "tapToGrant": "点击授权"
  }
```

在 `web/src/i18n/locales/en/common.json` 同样新增:

```json
  "permission": {
    "needsGrant": "Permission needed",
    "tapToGrant": "Tap to grant"
  }
```

- [ ] **Step 2: 新建 PermissionStatusBadge 组件**

创建 `web/src/components/domain/PermissionStatusBadge/PermissionStatusBadge.tsx`:

```tsx
/**
 * PermissionStatusBadge 业务组件
 *
 * Business Logic（为什么需要这个组件）:
 *   侧栏底部需要一个常驻的权限状态指示器：当屏幕录制/输入监控任一未授权时
 *   显示，提示用户「需要授权」，点击触发后端请求授权 + 打开系统设置面板。
 *   全部授权后自动隐藏。它是 Welcome 首次引导之后的长期兜底入口。
 *
 * Code Logic（这个组件做什么）:
 *   - 用 usePermissions() 持续轮询权限（不停止，作长期兜底）
 *   - loading 或 allGranted 时不渲染
 *   - 未授权时渲染可点击横条：红色 StatusDot(budy) + 文案「需要授权」
 *   - 点击调用 requestMissing()（弹系统授权框 + 打开设置面板）
 *   - 根元素 margin-top: auto 贴 Sidebar 内容区底部
 */

import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusDot } from '@/components/primitives';
import { usePermissions } from '@/hooks/usePermissions';
import styles from './PermissionStatusBadge.module.css';

function PermissionStatusBadgeInner() {
  const { t } = useTranslation(['common']);
  const { loading, allGranted, requestMissing } = usePermissions();

  const handleClick = useCallback(() => {
    void requestMissing();
  }, [requestMissing]);

  // hooks 在 early return 之前（规则 20）
  if (loading || allGranted) {
    return null;
  }

  return (
    <button
      type="button"
      className={styles.badge}
      onClick={handleClick}
      title={t('common:permission.tapToGrant')}
    >
      <StatusDot status="busy" size="sm" />
      <span className={styles.text}>{t('common:permission.needsGrant')}</span>
    </button>
  );
}

export const PermissionStatusBadge = memo(PermissionStatusBadgeInner);
PermissionStatusBadge.displayName = 'PermissionStatusBadge';
```

> 注:`StatusDot status="busy"` 映射 danger 色(红),语义为「需处理」。若与设计冲突可改用 `away`(warn 黄)。

- [ ] **Step 3: 新建样式**

创建 `web/src/components/domain/PermissionStatusBadge/PermissionStatusBadge.module.css`(hover 风格先读 `web/src/components/layout/NavItem/NavItem.module.css` 的 hover 写法对齐 token,若该文件用 `--surface-hover` 则沿用,否则用 `filter: brightness(0.96)`):

```css
/* PermissionStatusBadge - 侧栏底部授权状态徽标
 * margin-top: auto 让它贴 Sidebar .content 底部（紧邻 footer 分割线之上）
 */
.badge {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--fg);
  font-size: var(--text-sm);
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  width: 100%;
  box-sizing: border-box;
}

.badge:hover {
  background: var(--surface-hover, var(--surface));
  filter: brightness(0.97);
}

.text {
  font-weight: var(--weight-medium);
}
```

- [ ] **Step 4: 新建 index.ts**

创建 `web/src/components/domain/PermissionStatusBadge/index.ts`:

```ts
/**
 * PermissionStatusBadge 业务组件入口
 * 统一对外导出路径：`import { PermissionStatusBadge } from '@/components/domain/PermissionStatusBadge'`
 */

export { PermissionStatusBadge } from './PermissionStatusBadge';
```

- [ ] **Step 5: domain/index.ts 导出**

在 `web/src/components/domain/index.ts` 末尾(`PermissionCard` 导出之后)追加:

```ts
export { PermissionStatusBadge } from './PermissionStatusBadge';
```

- [ ] **Step 6: AppShell 集成徽标**

在 `web/src/components/layout/AppShell/AppShell.tsx` 的 import 区,把:

```ts
import { useAppVersion } from '../../../hooks/useAppVersion';
```

之后补一行(实际是从 domain 导入,与 ThemeToggle 等 layout import 并列即可):

```ts
import { PermissionStatusBadge } from '../../domain';
```

> 若 `'../../domain'` 路径解析报错,改用 `from '@/components/domain'`。

在 JSX 中,把 `<nav className={styles.navList}>...</nav>` 之后、`</Sidebar>` 之前插入徽标:

```tsx
        </nav>
        <PermissionStatusBadge />
      </Sidebar>
```

(即徽标作为 Sidebar children 的最后一项,靠自身 `margin-top:auto` 贴 content 底部。)

- [ ] **Step 7: 类型检查 + lint**

Run: `cd /Users/hans/python_project/claude-partner/web && npm run build && npm run lint`
Expected: 构建成功,lint 无错

- [ ] **Step 8: Commit**

```bash
git add web/src/components/domain/PermissionStatusBadge web/src/components/domain/index.ts web/src/components/layout/AppShell/AppShell.tsx web/src/i18n/locales/zh/common.json web/src/i18n/locales/en/common.json
git commit -m "feat(web): 新增侧栏底部权限状态徽标，未授权时常驻提示并可点击触发授权"
```

---

## Task 6: App.tsx OnboardingGuard 首次启动守卫

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: 新增 OnboardingGuard 并包裹 AppShell 路由**

把 `web/src/App.tsx` **整体替换**为:

```tsx
import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Home } from './pages/Home';
import { Transfer } from './pages/Transfer';
import { Prompts } from './pages/Prompts';
import { Scratchpad } from './pages/Scratchpad';
import { Devices } from './pages/Devices';
import { Settings } from './pages/Settings';
import { Welcome } from './pages/Welcome';
import { DesignSystem } from './pages/DesignSystem';
import { configApi } from './api/config';
import { PERMISSION_ONBOARDED_KEY } from './hooks/usePermissions';

const isDev = import.meta.env.DEV;

type GuardState = 'loading' | 'pass' | 'redirect';

/**
 * OnboardingGuard - 首次启动权限引导守卫
 *
 * Business Logic:
 *   仅在「首次启动且权限未全部就绪」时把用户导向 /welcome 一次。
 *   已完成引导（localStorage 标记）或权限已就绪则直接放行，避免每次打扰。
 *
 * Code Logic:
 *   - 读取 PERMISSION_ONBOARDED_KEY，已标记 → pass
 *   - 否则查权限，全部授权 → 写标记 + pass；否则 → redirect 到 /welcome
 *   - 查询失败 → pass（不阻塞用户）
 *   - hooks 在 early return 之前（规则 20）
 */
function OnboardingGuard() {
  const [state, setState] = useState<GuardState>('loading');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (localStorage.getItem(PERMISSION_ONBOARDED_KEY) === '1') {
        if (!cancelled) setState('pass');
        return;
      }
      try {
        const s = await configApi.permissions();
        if (cancelled) return;
        const all = s.screenCapture.granted && s.inputMonitoring.granted;
        if (all) {
          localStorage.setItem(PERMISSION_ONBOARDED_KEY, '1');
          setState('pass');
        } else {
          setState('redirect');
        }
      } catch {
        if (!cancelled) setState('pass');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') return null;
  if (state === 'redirect') return <Navigate to="/welcome" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<Welcome />} />
      <Route element={<OnboardingGuard />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/transfer" element={<Transfer />} />
          <Route path="/prompts" element={<Prompts />} />
          <Route path="/scratchpad" element={<Scratchpad />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/settings" element={<Settings />} />
          {isDev && <Route path="/design-system" element={<DesignSystem />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 2: 类型检查 + lint**

Run: `cd /Users/hans/python_project/claude-partner/web && npm run build && npm run lint`
Expected: 构建成功,lint 无错

- [ ] **Step 3: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(web): 新增 OnboardingGuard，首次启动权限未就绪时跳转 Welcome"
```

---

## Task 7: 全量验证 + 更新 web/CLAUDE.md

**Files:**
- Modify: `web/CLAUDE.md`

- [ ] **Step 1: 后端全量测试**

Run: `cd /Users/hans/python_project/claude-partner && python -m pytest tests/ -v`
Expected: 全部通过

- [ ] **Step 2: 前端构建 + lint**

Run: `cd /Users/hans/python_project/claude-partner/web && npm run build && npm run lint`
Expected: 构建成功,lint 无错

- [ ] **Step 3: 更新 web/CLAUDE.md**

在 `web/CLAUDE.md` 的「自定义 Hook」列表中,把 `useLanguage` 一行之后补:

```
、`usePermissions`（macOS 权限状态轮询 + 请求授权，导出 `PERMISSION_ONBOARDED_KEY` 常量供 OnboardingGuard/Welcome 共享）
```

并在「架构」小节适当位置(如路由说明后)补一段「macOS 权限流程」:

```
- **macOS 权限流程**: 首次启动 `OnboardingGuard`(`App.tsx`)检测权限未就绪 → 跳 `/welcome`(`usePermissions` 轮询，`PermissionCard` 点击触发后端 `POST /api/permissions/request` 弹系统授权框 + 打开设置面板)；完成引导写 `localStorage cp-permission-onboarded`。平时侧栏底部 `PermissionStatusBadge`(AppShell)常驻兜底，未授权时可点击触发同一授权流程。
```

- [ ] **Step 4: Commit**

```bash
git add web/CLAUDE.md
git commit -m "docs(web): 更新 CLAUDE.md 记录 macOS 权限授权流程"
```

---

## Self-Review

**1. Spec coverage(对应用户三决策):**
- 「请求+打开设置」→ Task1 `request_screen_capture_access`/`open_permission_settings` + Task2 端点 + Task3 `requestPermission` + Task4/5 `requestMissing` ✓
- 「首次引导+侧栏兜底」→ Task6 `OnboardingGuard` + Task4 Welcome 标记 + Task5 `PermissionStatusBadge` ✓
- 「删除通知卡」→ Task4 Step1 删 welcome.json notifications + Welcome.tsx `mapPermissions` 去掉 notifications 条目 ✓
- 「去设置」按钮真正可用 → Task4 `onRequestAccess` + Task5 徽标点击,均接通 `requestMissing` ✓

**2. Placeholder scan:** 无 TBD/TODO/「适当处理」;每个代码 step 给出完整代码;css hover 给了 fallback(`--surface-hover, var(--surface)` + `filter`)。

**3. Type consistency:**
- `PermissionType` = `'screenCapture' | 'inputMonitoring'`,types.ts 定义 → config.ts import → usePermissions import → Welcome id 用同名 ✓
- 后端 `_request_permissions` 返回 `{ok, requested, opened}` ↔ 前端 `PermissionRequestResult {ok, requested, opened, error?}` ✓
- `PERMISSION_ONBOARDED_KEY` 唯一定义于 usePermissions.ts,Welcome(Task4)/App(Task6)均 import ✓
- `PermissionStatusBadge` 导出路径 Task5 Step4(index.ts)↔ Step5(domain/index.ts)↔ AppShell import(Task5 Step6)一致 ✓

---

## 执行说明

- **依赖与并行**:Task1→Task2(后端链);Task3 为前端基础;Task4/Task5/Task6 依赖 Task3 但彼此改不同文件(Welcome.tsx+welcome.json / 新徽标组件+AppShell+common.json / App.tsx)可并行;Task7 收尾。
- **真实授权弹窗验证**:需 PyInstaller 打包后 `.app` 运行(check 函数 frozen 守卫所致);后端 `request_*`/`open_*` 可在 mac 直接跑后端用 curl 冒烟(Task2 Step7)。
- **合并**:按用户规则在 worktree 分支完成全部 task + 测试通过后,切回 master 合并、解决冲突、清理 worktree 分支。
