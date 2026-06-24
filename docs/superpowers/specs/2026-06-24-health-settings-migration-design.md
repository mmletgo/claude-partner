# 健康提醒设置迁移到设置页 — 设计文档

- 日期: 2026-06-24
- 范围: cc-partner 前端(web) + 后端(src-tauri) + i18n + 项目记忆(CLAUDE.md)
- 关联需求: 健康提醒配置迁移到设置页子页面;健康提醒设置补「恢复默认 / 应用配置」;常规页「保存」更名为「应用配置」以统一设置页

## 1. 背景与目标

### 1.1 现状

- **设置页**(`web/src/pages/Settings/Settings.tsx`)四个 tab:常规 / 同步 / AI / 关于。
  - 常规 tab:基本设置 + 权限管理 + 截图快捷键,底部按钮组「恢复默认 + **保存**」(`settings:action.save`),基于 `isDirty` 判断可保存。
  - 同步 tab、AI tab:均为「表单编辑 + **恢复默认 + 应用配置**」模式,各自独立加载、独立应用配置,不混入常规页的统一保存。
- **健康提醒页**(`web/src/pages/Health/Health.tsx`)是状态监控页,渲染状态概览 + 指标网格 + 图表 + 内嵌配置表单 `<Settings />`(`web/src/pages/Health/Settings.tsx`)。
  - 该配置表单是**即时应用**:每个字段 `onChange` 直接调 `healthApi.updateConfig(完整对象)`,**没有**「恢复默认」「应用配置」按钮。
- 后端(`src-tauri/src/commands/health.rs`)有 `get_health_config` / `update_health_config`,**缺少** `get_default_health_config`(同步/AI 都有对应的 `get_default_*_config`);但 `src-tauri/src/config.rs` 已有 `HealthConfig::default()`,默认值常量齐全。

### 1.2 目标

1. 把健康提醒配置**迁移**到设置页新增的「健康提醒」子 tab,监控页不再内嵌配置表单。
2. 健康提醒配置改为「表单编辑 + **恢复默认 + 应用配置**」模式,与同步/AI tab 行为一致。
3. 常规页底部「保存」按钮更名为「应用配置」,使设置页所有保存类按钮命名统一。
4. 健康提醒 tab 与设置页其他 tab **视觉统一**:复用设置页通用样式(开关用 `toggleRow + Pill`,数字/时间用 `field + label + helper + Input`)。

### 1.3 非目标(YAGNI)

- 不改变健康提醒后端状态机 / daemon / 提醒事件机制。
- 不调整同步 tab、AI tab 现有实现(仅按钮文案命名上保持一致)。
- 不为健康 tab 增加 dirty 状态提示(对齐同步/AI:用「已应用配置」快照 + 错误提示,不做 dirty 提示)。
- 监控页不删除「启用/停用监测」「暂停/恢复」运行时控件(这些是运行操作,不是配置)。

## 2. Tab 顺序

设置页 tab 顺序调整为(健康提醒置于常规之后):

> 常规 / **健康提醒** / 同步 / AI / 关于

监控页「配置」按钮深链至 `/settings?tab=health`,设置页 mount 时读取 `tab` 查询参数作为默认激活 tab。

## 3. 后端设计(src-tauri)

### 3.1 新增命令 `get_default_health_config`

文件:`src-tauri/src/commands/health.rs`,紧邻 `get_health_config` 之后。

```rust
/// 读取健康提醒默认配置(供设置页「恢复默认」按钮)。
///
/// Business Logic: 设置页健康提醒 tab 的「恢复默认」需用后端权威默认值重置表单,
///                 与同步/AI tab 的 get_default_*_config 行为一致,故新增命令避免前端硬编码。
/// Code Logic: 返回 `HealthConfig::default()`(config.rs 中已定义,与 serde 单字段缺失回退一致),
///             经 `From<HealthConfig>` 转 DTO 返回。
#[tauri::command]
pub async fn get_default_health_config() -> Result<HealthConfigDto, AppError> {
    Ok(crate::config::HealthConfig::default().into())
}
```

> 不依赖 `State`,因为默认值是纯常量。确认 `HealthConfig` 的可见性(`config.rs` 中为 `pub`)与 `HealthConfigDto: From<HealthConfig>` 已存在(被 `get_health_config` 使用)。

### 3.2 注册命令

文件:`src-tauri/src/lib.rs`,在 `health_cmd::get_health_config`(约 486 行)旁新增:

```rust
health_cmd::get_default_health_config,
```

### 3.3 字段映射参考

`HealthConfigDto`(camelCase,serde rename)字段,与前端 `HealthConfig` 一一对应:

`enabled` · `workWindowSeconds` · `breakSeconds` · `recordWindowTitle` · `retainDays` · `notifyEnabled` · `dndStart`(string|null) · `dndEnd`(string|null) · `waterEnabled` · `waterIntervalSeconds` · `reminderFullscreen`

默认值(`HealthConfig::default()`):enabled=true, workWindowSeconds=2700(45min), breakSeconds=300(5min), recordWindowTitle=true, retainDays=90, notifyEnabled=true, dndStart=None, dndEnd=None, waterEnabled=true, waterIntervalSeconds=3600(60min), reminderFullscreen=false。

## 4. 前端设计(web)

### 4.1 API 层 `web/src/api/health.ts`

`healthApi` 新增:

```ts
/** 读取健康提醒默认配置(设置页「恢复默认」用,对齐同步/AI 的 getDefault 模式) */
getDefaultConfig: () => invoke<HealthConfig>('get_default_health_config'),
```

### 4.2 表单状态 `web/src/pages/Settings/settingsState.ts`

- 健康表单与 `HealthConfig`(来自 `@/lib/types`)同构,直接复用类型:`export type HealthForm = HealthConfig;`
- 新增占位常量 `PENDING_HEALTH_FORM: HealthForm`(用后端默认值常量填充,仅 loading 期占位,真实默认由后端覆盖):
  ```ts
  export const PENDING_HEALTH_FORM: HealthForm = {
    enabled: true, workWindowSeconds: 45 * 60, breakSeconds: 5 * 60,
    recordWindowTitle: true, retainDays: 90, notifyEnabled: true,
    dndStart: null, dndEnd: null, waterEnabled: true,
    waterIntervalSeconds: 60 * 60, reminderFullscreen: false,
  };
  ```
- 新增 `healthConfigToForm(config: HealthConfig | null): HealthForm`:null 返回 `{ ...PENDING_HEALTH_FORM }`,否则返回 `config` 拷贝(恒等映射,仅为与其他 tab 的 `*ConfigToForm` 模式对齐 + null 安全)。

### 4.3 新增组件 `web/src/pages/Settings/HealthPanel.tsx`

职责:**纯渲染**健康提醒 tab 内容(字段分组 + 按钮组),不含数据加载/状态。接收受控 props,内部用设置页通用样式渲染。

Props 接口:

```ts
interface HealthPanelProps {
  form: HealthForm;                       // 当前表单值
  applied: HealthConfig | null;           // 最近已应用配置快照(显示用)
  onPatch: (partial: Partial<HealthForm>) => void;
  onResetDefaults: () => void;
  onApply: () => void;
  applying: boolean;
  error: string | null;
}
```

内部小组件(私有,复用 `Settings.module.css` 既有类):

- `ToggleRow({label, helper, checked, onToggle})` — `button.toggleRow[role=switch]` + `toggleText/toggleLabel/toggleHelper` + `toggleState` 内 `Pill`(success/neutral + CheckIcon/XIcon),与同步/AI tab 开关完全同款。
- `NumberRow({label, helper, value, min, max, onChange})` — `div.field` + `label.label` + `Input[type=number].mono` + `p.helper`。
- `TimeRow({label, value, onChange})` — `div.field` + `label.label` + `Input[type=text].mono`(本地 draft,失焦/回车提交,空串↔null)。

私有工具:`TIME_PATTERN` + `normalizeTimeDraft(draft)`(从原 `Health/Settings.tsx` 平移,逻辑不变:`09:30`/`9:30`/`0930`/`930` 归一为 `HH:MM`,空串↔null,非法返回 undefined 触发回滚)。

字段分组(文案复用 `health` namespace 既有 key,组件 `useTranslation(['settings','health','common'])`):

- 监测(`health:monitoringGroup`):enabled / workWindowMinutes(×60 换算) / breakMinutes(×60)
- 提醒(`health:reminderGroup`):notifyEnabled / reminderFullscreen / waterEnabled / waterIntervalMinutes(×60)
- 免打扰时段(`health:quietHoursGroup`):dndStart / dndEnd(两个 `TimeRow`)
- 隐私(`health:privacyGroup`):recordWindowTitle / retainDays

字段 `onChange` 调 `onPatch({...})`,**只更新表单状态,不落盘**(与同步/AI 一致)。

底部按钮组(复用 `aboutActions`):「恢复默认」(`action.resetDefault`,ghost) + 「应用配置」(`action.apply`,primary)。可选显示「已应用配置」快照(`metaRow`,参考同步/AI 的 appliedConfig)+ 错误提示(`updateError`)。

### 4.4 `Settings.tsx` 集成

- `SettingsTabId` 增加 `'health'`;`SETTINGS_TABS` 顺序改为 `general / health / sync / ai / about`。
- 新增顶层状态(与 cloudSync/githubTrending 同层):
  ```ts
  const [healthForm, setHealthForm] = useState<HealthForm>({ ...PENDING_HEALTH_FORM });
  const [defaultHealthForm, setDefaultHealthForm] = useState<HealthForm>({ ...PENDING_HEALTH_FORM });
  const [healthConfig, setHealthConfig] = useState<HealthConfig | null>(null); // 已应用快照
  const [applyingHealth, setApplyingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  ```
- `loadConfig` 的 `Promise.all` 增补两项:`healthApi.getConfig()`、`healthApi.getDefaultConfig()`,加载后 `setHealthConfig` / `setHealthForm(healthConfigToForm(...))` / `setDefaultHealthForm(healthConfigToForm(...))`。
- 新增 handlers:
  - `patchHealthForm(partial)` — 浅合并 `healthForm`。
  - `handleResetHealthDefaults()` — `setHealthForm(defaultHealthForm)` + `setHealthError(null)`。
  - `handleApplyHealth()` — `setApplyingHealth(true)`,调 `healthApi.updateConfig(healthForm)`(表单即完整 HealthConfig),成功则 `setHealthConfig(updated)` + `setHealthForm(healthConfigToForm(updated))`,失败 `setHealthError(...)`,finally 复位 applying。
- `activeTab` 初始值:mount 时从 `useSearchParams` 读 `tab`(`'health'` 等有效 id 才采用,否则 `'general'`)。
- 渲染:新增 `activeTab === 'health'` 分支,渲染 `#settings-panel-health`(role=tabpanel)+ `<HealthPanel .../>`。
- 常规页底部按钮组改名:`settings:action.save`→`settings:action.apply`,`saving`→`applying`;disabled 条件保留 `!isDirty || applying`。

### 4.5 监控页改造 `web/src/pages/Health/Health.tsx`

- 移除 `import { Settings } from './Settings'` 与末尾 `<Settings />`。
- 头部 `headerActions` 在「启用/停用监测」按钮前新增「配置」按钮(`Button variant=secondary`),`onClick` 调 `navigate('/settings?tab=health')`(`useNavigate`)。文案走 `health:goToSettings`(新增)。
- 其余状态概览/指标/图表/启用·暂停逻辑不变。

### 4.6 删除

- `web/src/pages/Health/Settings.tsx`
- `web/src/pages/Health/Settings.module.css`
- 确认无其他引用后再删(原仅 `Health.tsx` 引用)。

## 5. i18n(`web/src/i18n/locales/{zh,en}/settings.json`)

新增 / 修改 key(zh / en):

- `tabs.health` = 「健康提醒」/ 「Health」
- `action.apply` = 「应用配置」/ 「Apply」(常规页与健康 tab 共用)
- `action.applying` = 「应用中…」/ 「Applying…」
- `health.title` = 「健康提醒」/ 「Health reminder」
- `health.subtitle` = 说明久坐监测/喝水/免打扰等参数在此调整 / 同义英文
- `health.appliedConfig` = 「已应用配置」/ 「Applied config」
- `health.applyFailed` = 「应用健康提醒配置失败」/ 「Failed to apply health config」

修改(语义对齐「应用配置」):

- `status.dirtyHint` = 「有未应用的修改」/ 「You have unapplied changes」
- `status.savedAt` = 「已应用于 {{time}}」/ 「Applied at {{time}}」

删除(不再引用):

- `action.save`、`action.saving`

监控页文案(`web/src/i18n/locales/{zh,en}/health.json`):

- 新增 `goToSettings` = 「配置」/ 「Configure」

> 健康提醒字段文案(`enabled`/`workWindowMinutes` 等)已在 `health` namespace,设置页复用,无需重复定义。改完 `npm run build`(tsc 校验 key)。

## 6. 文档与测试(项目规则 #5/#10)

- `web/CLAUDE.md`:更新 Settings 描述(tabs 顺序、常规页按钮改名「应用配置」、新增健康提醒 tab 说明 + 深链 `?tab=health`、HealthPanel 组件、settingsState.HealthForm/healthConfigToForm、healthApi.getDefaultConfig);Health 页描述改为「状态监控页 + 启用/暂停 + 配置跳转入口」,移除「完整配置表单」。
- `src-tauri/CLAUDE.md`:新增 `get_default_health_config` 命令说明。
- `web/src/pages/Settings/settingsState.test.ts`:补 `healthConfigToForm` 纯函数测试(null 返回占位、非 null 恒等、不引用同一对象)。
- 新增 `HealthPanel` 的 `normalizeTimeDraft` 回归测试(可放在 `HealthPanel.test.ts`,或并入现有测试):覆盖 `09:30`/`9:30`/`0930`/`930`/空串/非法值。

## 7. 实现策略(规则 #6/#14)

- 用 **git worktree** 新分支开发,完成后合并回 master。
- 按层拆分 subagent 并行:
  1. **后端**:`get_default_health_config` 命令 + lib.rs 注册 + `src-tauri/CLAUDE.md`。
  2. **前端核心**:`health.ts` API + `settingsState.ts` + `HealthPanel.tsx` + `Settings.tsx` 集成 + `Health.tsx` 改造 + 删除旧文件 + `web/CLAUDE.md`。
  3. **i18n + 测试**:`settings.json`/`health.json`(zh+en) + `settingsState.test.ts` + `normalizeTimeDraft` 测试。
- 主控不 Read subagent 输出,完成后审 git diff,跑 `npm run build` / `cargo clippy` / `cargo test` / `npx tsx ...test.ts` 验证。

## 8. 验收标准

- 设置页出现「健康提醒」tab(常规之后),内含完整字段表单 + 「恢复默认」「应用配置」按钮。
- 「恢复默认」把表单重置为后端默认;「应用配置」把表单写入后端并刷新「已应用配置」快照。
- 常规页底部按钮文案为「应用配置」(非「保存」);切换语言正确。
- 监控页不再有配置表单;头部「配置」按钮跳转 `/settings?tab=health` 并默认打开健康提醒 tab。
- 后端 `cargo clippy -D warnings` + `cargo test` 通过;前端 `npm run build`(tsc+vite)通过;新增/补充测试通过。
- `web/CLAUDE.md`、`src-tauri/CLAUDE.md` 同步更新。

## 9. 风险与陷阱

- **整体覆盖式回写**:`update_health_config` 整体覆盖,故「应用配置」必须提交完整表单(HealthPanel 的 `onPatch` 只改本地,提交时整体发 healthForm),与原即时应用语义一致——本设计天然满足。
- **dndStart/dndEnd 为 string|null**:`TimeRow` 空串↔null 转换必须保持,提交时整体表单已含正确 null。
- **深链 tab 激活**:`useSearchParams` 读 `tab` 仅在 mount 初值生效;若用户已在设置页内点击深链(同页 query 变化),需监听 search param 变化更新 activeTab,或接受「仅首次进入生效」(本设计取首次进入生效,简单且够用)。
- **删除文件前确认引用**:旧 `Health/Settings.tsx` 仅被 `Health.tsx` 引用,删除前 grep 确认。
- **i18n key 删除**:`action.save`/`action.saving` 删除前 grep 确认无其他引用(仅常规页底部)。
