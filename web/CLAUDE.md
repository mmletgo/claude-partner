# web/ - React 前端

## 概述

基于 React + TypeScript + Vite 的前端界面，通过 fetch 调用后端 aiohttp HTTP API。

## 开发命令

- `npm run dev` — 启动 Vite 开发服务器（端口 5173）
- `npm run build` — 打包到 dist/
- `npm run lint` — ESLint 检查

## 架构

- **API 客户端**: `src/api/client.ts` — BASE_URL 为空字符串，使用 `window.location.origin` 构建请求 URL
- **API 模块**: `src/api/prompts.ts`, `src/api/config.ts` 等 — 各资源 RESTful 调用
- **页面**: `src/pages/` — Home（最近 Prompts）/ Prompts（列表管理，自定义多标签 + 动态标签筛选）/ Scratchpad（速记本，纯内存临时记事）/ Settings / Transfer / Devices
- **路由**: `src/App.tsx` — React Router，`/` → Home，`/prompts` → Prompts，`/scratchpad` → Scratchpad 等
- **自定义 Hook**: `src/hooks/` — `useTheme`（浅/深主题）、`useLanguage`（中英文切换，复刻 useTheme 的 localStorage + 自定义事件同步范式）
- **i18n**: `src/i18n/` — react-i18next 多 namespace（en/zh）；语言检测 localStorage(`cp-lang`) > `navigator.language` > en；切换器在 Sidebar 底部。**禁止在组件里硬编码用户可见中/英文字面量**，一律走 `src/i18n/locales/{en,zh}/<ns>.json` + `t('<ns>:<key>')`。详见下方「i18n 国际化」。

## Vite 代理（开发模式）

自定义 Vite 插件 `dynamicApiProxy` 将 `/api` 请求代理到后端：
- 每次请求读取 `~/.claude-partner/backend.port` 获取后端动态端口
- 使用 Node.js 内置 `http` 模块实现代理，无额外依赖

**重要**: 不能使用 `connect` 的 path-based mounting（`server.middlewares.use('/api', handler)`），
在 Vite 8 中该写法不会拦截 `/api` 请求。必须用 `server.middlewares.use((req, res, next) => { if (req.url?.startsWith('/api')) ... })` 手动检查 URL 前缀。

## 打包部署

- `npm run build` 输出到 `dist/`，后端通过 `HTTPServer.serve_static()` 提供静态文件服务
- 后端 SPA 回退路由 `/{path:.*}` 返回 `index.html`，支持前端路由刷新

## i18n 国际化

- **库**: react-i18next + i18next，初始化在 `src/i18n/index.ts`（`declare module` 类型扩展，`t()` 的 key 编译期校验，拼错即 tsc 报错）
- **命名空间**: `common`（动作/状态枚举/方向，跨页共享）、`nav`、各页面一个（home/prompts/transfer/devices/scratchpad/welcome/settings）
- **写法约定**（i18next v26 类型硬要求）:
  - 组件内 `const { t } = useTranslation([用到的所有ns数组]);`，所有 `t('ns:key')` **带 ns 前缀**
  - 模块级 helper 接收 `t: TFunction<'ns'>`，内部调用**省略 ns 前缀**
  - 插值 `{{var}}`；英文复数 en `{key}` + `{key}_other`，zh 只 `{key}`
- **切换/持久化**: `useLanguage` hook（localStorage `cp-lang` + `cp-lang-change` 自定义事件 + `storage` 事件跨标签/多窗口同步）；首次按系统语言推断
- **术语保留英文**: Prompt / GitHub / KB·MB 等在 en/zh 资源都保留英文
- **DesignSystem 页**: dev-only，不纳入 i18n（保持英文）
- **新增页面文案**: 在 `src/i18n/locales/{en,zh}/<页ns>.json` 加 key + 组件 `useTranslation(['<页ns>','common'])` + `t('<页ns>:key')`；改完 `npm run build`（tsc 校验 key）
