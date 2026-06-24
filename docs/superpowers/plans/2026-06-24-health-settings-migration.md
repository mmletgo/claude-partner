# 健康提醒设置迁移到设置页 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把健康提醒配置从 Health 监控页迁移到设置页新增的「健康提醒」子 tab(表单编辑 + 恢复默认 + 应用配置),常规页「保存」改名为「应用配置」,设置页按钮命名与模式统一。

**Architecture:** 后端补 `get_default_health_config` 命令(复用 `HealthConfig::default()`)供「恢复默认」;前端抽 `HealthPanel.tsx` 纯渲染组件(复用设置页通用样式),状态/加载/handlers 留在 `Settings.tsx` 顶层(与 cloudSync/githubTrending 同模式);监控页移除内嵌表单,加「配置」按钮深链 `/settings?tab=health`。

**Tech Stack:** Tauri 2 + Rust(axum/sqlx)、React 19 + TypeScript + Vite、react-i18next。

## Global Constraints

- **i18n 硬约束**:组件内禁止硬编码中英文字面量,一律 `src/i18n/locales/{en,zh}/<ns>.json` + `t('<ns>:<key>')`;i18next v26 对 `t()` key 编译期校验,缺失 key 会 tsc 报错 —— **新增 key 的任务必须在使用它的 task 之前完成**(本计划 i18n 在 Task 2,使用方在 Task 6/7)。
- **hooks 顺序(项目规则 20)**:所有 hooks(useState/useEffect/useSearchParams/useTranslation 等)必须在任何 early return 之前调用。
- **整体覆盖式回写**:`update_health_config` 整体覆盖 config.health,「应用配置」必须提交完整表单对象(HealthPanel 的 onPatch 只改本地表单,提交时整体发送 healthForm)。
- **无需向后兼容**(项目规则 15):删除 `Health/Settings.tsx`、`action.save`/`action.saving` 等,不留兼容入口。
- **后端命令 serde**:返回前端的 struct 一律 `#[serde(rename_all="camelCase")]`,对齐前端 types。
- **编码**:所有代码文件 UTF-8;函数/类加中文 docstring(项目规则)。

## File Structure

- `src-tauri/src/commands/health.rs` — 新增 `get_default_health_config` 命令 + 单测
- `src-tauri/src/lib.rs` — 注册新命令,更新注释(11→12 命令)
- `web/src/i18n/locales/{zh,en}/settings.json` — 新增 tabs.health/action.apply/applying/health.*;改 status.dirtyHint/savedAt;删 action.save/saving
- `web/src/i18n/locales/{zh,en}/health.json` — 新增 goToSettings
- `web/src/pages/Settings/settingsState.ts` — 新增 `HealthForm`/`PENDING_HEALTH_FORM`/`healthConfigToForm`
- `web/src/pages/Settings/settingsState.test.ts` — 补 `healthConfigToForm` 测试
- `web/src/pages/Settings/HealthPanel.tsx` — **新建** 健康提醒 tab 纯渲染组件(含 `normalizeTimeDraft` export)
- `web/src/pages/Settings/HealthPanel.test.ts` — **新建** `normalizeTimeDraft` 回归测试
- `web/src/api/health.ts` — 新增 `getDefaultConfig`
- `web/src/pages/Settings/Settings.tsx` — tabs 顺序 + 深链 + health 状态/handlers + 渲染 HealthPanel + 常规按钮改名
- `web/src/pages/Health/Health.tsx` — 移除内嵌表单 + 「配置」按钮跳转
- `web/src/pages/Health/Settings.tsx` — **删除**
- `web/src/pages/Health/Settings.module.css` — **删除**
- `web/CLAUDE.md` / `src-tauri/CLAUDE.md` — 项目记忆同步

---

### Task 1: 后端 `get_default_health_config` 命令(TDD)

**Files:**
- Modify: `src-tauri/src/commands/health.rs`(在 `get_health_config` 之后新增命令 + 文件末尾 `#[cfg(test)]` 模块)
- Modify: `src-tauri/src/lib.rs:485-486`(注册 + 改注释)

**Interfaces:**
- Produces: `#[tauri::command] pub async fn get_default_health_config() -> Result<HealthConfigDto, AppError>`,前端经 `invoke('get_default_health_config')` 得 `HealthConfig`(camelCase)。

- [ ] **Step 1: 写失败测试(同步验证 default→DTO 字段)**

在 `src-tauri/src/commands/health.rs` 文件**末尾**追加:

```rust
#[cfg(test)]
mod default_config_tests {
    use super::*;

    #[test]
    fn default_health_config_dto_matches_documented_defaults() {
        let dto: HealthConfigDto = HealthConfig::default().into();
        assert!(dto.enabled, "默认开启久坐监测");
        assert_eq!(dto.work_window_seconds, 45 * 60);
        assert_eq!(dto.break_seconds, 5 * 60);
        assert!(dto.record_window_title);
        assert_eq!(dto.retain_days, 90);
        assert!(dto.notify_enabled);
        assert_eq!(dto.dnd_start, None);
        assert_eq!(dto.dnd_end, None);
        assert!(dto.water_enabled);
        assert_eq!(dto.water_interval_seconds, 60 * 60);
        assert!(!dto.reminder_fullscreen);
    }
}
```

- [ ] **Step 2: 运行测试确认通过(默认值本就存在,此测试锁定契约)**

Run: `cd src-tauri && cargo test default_health_config_dto_matches_documented_defaults -- --nocapture`
Expected: PASS(若失败说明 `HealthConfig::default()` 被改过,需先核对 `config.rs`)。

- [ ] **Step 3: 实现 `get_default_health_config` 命令**

在 `src-tauri/src/commands/health.rs` 中 `get_health_config` 函数(约 131 行)之后插入:

```rust
/// 读取健康提醒默认配置(供设置页「恢复默认」按钮)。
///
/// Business Logic: 设置页健康提醒 tab 的「恢复默认」需用后端权威默认值重置表单,
///                 与同步/AI tab 的 `get_default_*_config` 行为一致,避免前端硬编码默认值。
/// Code Logic: 返回 `HealthConfig::default()`(config.rs 中已定义,与 serde 单字段缺失回退一致),
///             经 `From<HealthConfig>` 转 DTO 返回;不依赖 State,默认值是纯常量。
#[tauri::command]
pub async fn get_default_health_config() -> Result<HealthConfigDto, AppError> {
    Ok(crate::config::HealthConfig::default().into())
}
```

> `HealthConfig` 已在文件顶部 `use crate::config::HealthConfig;` 引入(line 16),`HealthConfigDto: From<HealthConfig>` 已存在(line 51)。无需新 import。

- [ ] **Step 4: 注册命令 + 更新注释**

在 `src-tauri/src/lib.rs` 第 486 行 `health_cmd::get_health_config,` 之后插入一行:

```rust
            health_cmd::get_health_config,
            health_cmd::get_default_health_config,
            health_cmd::get_health_status,
```

并把第 485 行注释 `// M10 健康提醒(11 命令:...)` 改为 `// M10 健康提醒(12 命令:...新增 get_default_health_config)`。

- [ ] **Step 5: 编译 + lint**

Run: `cd src-tauri && cargo clippy -- -D warnings`
Expected: 无 warning 无 error。

- [ ] **Step 6: Commit**

```bash
cd src-tauri && git add src/commands/health.rs src/lib.rs
git commit -m "feat(health): 新增 get_default_health_config 命令供设置页恢复默认"
```

---

### Task 2: i18n 新增/修改 key(先于前端使用)

**Files:**
- Modify: `web/src/i18n/locales/zh/settings.json`
- Modify: `web/src/i18n/locales/en/settings.json`
- Modify: `web/src/i18n/locales/zh/health.json`
- Modify: `web/src/i18n/locales/en/health.json`

**Interfaces:**
- Produces:`settings:tabs.health`、`settings:action.apply`、`settings:action.applying`、`settings:health.{title,subtitle,appliedConfig,applyFailed}`、`health:goToSettings`;修改 `settings:status.{dirtyHint,savedAt}`。

- [ ] **Step 1: zh/settings.json**

`tabs` 对象加 `"health": "健康提醒"`(放 `general` 之后):

```json
  "tabs": {
    "general": "常规",
    "health": "健康提醒",
    "sync": "同步",
    "ai": "AI",
    "about": "关于"
  },
```

`action` 对象改为(删 save/saving,加 apply/applying):

```json
  "action": {
    "apply": "应用配置",
    "applying": "应用中…",
    "resetDefault": "恢复默认"
  },
```

`status` 对象改文案:

```json
  "status": {
    "dirtyHint": "有未应用的修改",
    "savedAt": "已应用于 {{time}}"
  },
```

在 `githubTrending` 与 `about` 之间插入 `health` 子组:

```json
  "health": {
    "title": "健康提醒",
    "subtitle": "调整久坐监测的工作/休息阈值、提醒方式、喝水提醒、免打扰时段与隐私设置。",
    "appliedConfig": "已应用配置",
    "applyFailed": "应用健康提醒配置失败"
  },
```

- [ ] **Step 2: en/settings.json(同结构英文)**

`tabs`:
```json
  "tabs": {
    "general": "General",
    "health": "Health",
    "sync": "Sync",
    "ai": "AI",
    "about": "About"
  },
```

`action`:
```json
  "action": {
    "apply": "Apply",
    "applying": "Applying…",
    "resetDefault": "Reset to defaults"
  },
```

`status`:
```json
  "status": {
    "dirtyHint": "You have unapplied changes",
    "savedAt": "Applied at {{time}}"
  },
```

`health` 子组(插在 `githubTrending` 与 `about` 之间):
```json
  "health": {
    "title": "Health reminder",
    "subtitle": "Tune sedentary-monitor work/break thresholds, reminder style, water reminders, quiet hours, and privacy.",
    "appliedConfig": "Applied config",
    "applyFailed": "Failed to apply health config"
  },
```

- [ ] **Step 3: zh/health.json + en/health.json 加 goToSettings**

在 `health` 命名空间根级(与现有 key 平级)新增一条:
- zh: `"goToSettings": "配置",`
- en: `"goToSettings": "Configure",`

> 放置位置可紧邻 `resume`/`pause` 等按钮 key 附近。改完确认 JSON 合法(无尾逗号)。

- [ ] **Step 4: 校验 JSON 合法**

Run: `cd web && node -e "['zh','en'].forEach(l=>{JSON.parse(require('fs').readFileSync('src/i18n/locales/'+l+'/settings.json','utf8'));JSON.parse(require('fs').readFileSync('src/i18n/locales/'+l+'/health.json','utf8'))});console.log('json ok')"`
Expected: 输出 `json ok`。

- [ ] **Step 5: Commit**

```bash
git add web/src/i18n/locales/zh/settings.json web/src/i18n/locales/en/settings.json web/src/i18n/locales/zh/health.json web/src/i18n/locales/en/health.json
git commit -m "i18n: 新增设置页健康提醒 tab 文案 + 常规页按钮改「应用配置」"
```

---

### Task 3: `settingsState.ts` — `HealthForm` + `healthConfigToForm`(TDD)

**Files:**
- Modify: `web/src/pages/Settings/settingsState.ts`(顶部 import + 新增类型/常量/函数)
- Test: `web/src/pages/Settings/settingsState.test.ts`

**Interfaces:**
- Consumes: `HealthConfig` from `@/lib/types`
- Produces: `export type HealthForm = HealthConfig;`、`export const PENDING_HEALTH_FORM: HealthForm;`、`export function healthConfigToForm(config: HealthConfig | null): HealthForm;`

- [ ] **Step 1: 写失败测试**

在 `web/src/pages/Settings/settingsState.test.ts` 顶部 import 区追加 `healthConfigToForm`、`PENDING_HEALTH_FORM`(沿用文件现有 import 风格),并在文件内新增:

```ts
describe('healthConfigToForm', () => {
  it('null 返回占位默认表单(且为新对象)', () => {
    const form = healthConfigToForm(null);
    expect(form).toEqual(PENDING_HEALTH_FORM);
    expect(form).not.toBe(PENDING_HEALTH_FORM);
  });

  it('非 null 原样拷贝字段(恒等映射,含 null dnd)', () => {
    const cfg: HealthConfig = {
      enabled: false,
      workWindowSeconds: 120,
      breakSeconds: 60,
      recordWindowTitle: false,
      retainDays: 7,
      notifyEnabled: false,
      dndStart: '22:00',
      dndEnd: null,
      waterEnabled: false,
      waterIntervalSeconds: 1800,
      reminderFullscreen: true,
    };
    const form = healthConfigToForm(cfg);
    expect(form).toEqual(cfg);
    expect(form).not.toBe(cfg);
  });
});
```

> 若 `settingsState.test.ts` 顶部尚未 import `HealthConfig`,补 `import type { HealthConfig } from '../../lib/types';`(路径以文件现有 import 为准,该文件用相对路径 `'../../lib/types'`)。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && npx tsx src/pages/Settings/settingsState.test.ts`
Expected: FAIL(`healthConfigToForm` / `PENDING_HEALTH_FORM` 未定义)。

- [ ] **Step 3: 实现**

在 `web/src/pages/Settings/settingsState.ts` 顶部 import 行(`import type { AppConfig, CloudSyncConfig, GithubTrendingConfig } from '../../lib/types';`)改为追加 `HealthConfig`:

```ts
import type { AppConfig, CloudSyncConfig, GithubTrendingConfig, HealthConfig } from '../../lib/types';
```

在 `GithubTrendingForm` interface 之后、`SettingsConfigUpdate` 之前插入:

```ts
/** 健康提醒 tab 的受控表单值;与 HealthConfig 同构,直接整体提交给 update_health_config。 */
export type HealthForm = HealthConfig;

/** 健康表单加载前占位值;真实值由后端 get_health_config / get_default_health_config 覆盖。 */
export const PENDING_HEALTH_FORM: HealthForm = {
  enabled: true,
  workWindowSeconds: 45 * 60,
  breakSeconds: 5 * 60,
  recordWindowTitle: true,
  retainDays: 90,
  notifyEnabled: true,
  dndStart: null,
  dndEnd: null,
  waterEnabled: true,
  waterIntervalSeconds: 60 * 60,
  reminderFullscreen: false,
};

/**
 * 将后端 HealthConfig 映射为健康 tab 受控表单值
 *
 * Business Logic（为什么需要）:
 *   健康 tab 需用同一套映射处理当前配置和恢复默认配置,与其他 tab 的 *ConfigToForm 模式对齐。
 *
 * Code Logic（做什么）:
 *   null 返回占位默认的新拷贝;非 null 返回字段拷贝(恒等映射 + null 安全,避免外部直接持有同一引用)。
 */
export function healthConfigToForm(config: HealthConfig | null): HealthForm {
  if (!config) return { ...PENDING_HEALTH_FORM };
  return { ...config };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && npx tsx src/pages/Settings/settingsState.test.ts`
Expected: PASS(全部用例,含原有 shortcut/settingsState 用例)。

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Settings/settingsState.ts web/src/pages/Settings/settingsState.test.ts
git commit -m "feat(settings): 新增 HealthForm + healthConfigToForm(健康 tab 表单映射)"
```

---

### Task 4: `health.ts` API — `getDefaultConfig`

**Files:**
- Modify: `web/src/api/health.ts`(在 `getConfig` 之后新增)

**Interfaces:**
- Produces: `healthApi.getDefaultConfig: () => Promise<HealthConfig>`

- [ ] **Step 1: 新增方法**

在 `web/src/api/health.ts` 中 `getConfig` 方法之后插入:

```ts
  /** 读取健康提醒默认配置(设置页「恢复默认」用,对齐同步/AI 的 getDefault 模式) */
  getDefaultConfig: () => invoke<HealthConfig>('get_default_health_config'),
```

- [ ] **Step 2: 类型/构建校验**

Run: `cd web && npx tsc --noEmit`
Expected: 无 error。

- [ ] **Step 3: Commit**

```bash
git add web/src/api/health.ts
git commit -m "feat(health): healthApi 新增 getDefaultConfig"
```

---

### Task 5: `HealthPanel.tsx` + `normalizeTimeDraft`(TDD)

**Files:**
- Create: `web/src/pages/Settings/HealthPanel.tsx`
- Create: `web/src/pages/Settings/HealthPanel.test.ts`

**Interfaces:**
- Consumes: `HealthForm`/`HealthConfig` from `./settingsState` & `@/lib/types`;复用 `./Settings.module.css` 通用类。
- Produces: `export function normalizeTimeDraft(draft): string | null | undefined`、`export function HealthPanel(props: HealthPanelProps): JSX.Element`。

- [ ] **Step 1: 写 normalizeTimeDraft 失败测试**

`web/src/pages/Settings/HealthPanel.test.ts`:

```ts
import { describe, it, expect } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeTimeDraft } from './HealthPanel';

describe('normalizeTimeDraft', () => {
  const cases: Array<[string, string | null | undefined]> = [
    ['', null],
    ['09:30', '09:30'],
    ['9:30', '09:30'],
    ['0930', '09:30'],
    ['930', '09:30'],
    ['23:59', '23:59'],
    ['25:00', undefined],
    ['12:60', undefined],
    ['abc', undefined],
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' → ${String(expected)}`, () => {
      assert.strictEqual(normalizeTimeDraft(input), expected);
    });
  }
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && npx tsx src/pages/Settings/HealthPanel.test.ts`
Expected: FAIL(找不到 `./HealthPanel`)。

- [ ] **Step 3: 实现 HealthPanel.tsx(含 normalizeTimeDraft export)**

`web/src/pages/Settings/HealthPanel.tsx`:

```tsx
/**
 * 健康提醒设置面板 - 设置页「健康提醒」tab 的纯渲染组件
 *
 * Business Logic（为什么需要这个组件）:
 *   健康提醒配置从 Health 监控页迁移到设置页;用户在此表单编辑久坐监测的全部参数
 *   (工作/休息阈值、提醒方式、喝水、免打扰、隐私),通过「恢复默认」「应用配置」提交,
 *   与同步/AI tab 的表单编辑 + 手动应用模式一致。本组件只负责渲染,状态由 Settings.tsx 顶层持有。
 *
 * Code Logic（这个组件做什么）:
 *   - 复用设置页通用样式(field/label/helper/toggleList/toggleRow/Pill/Input)保证视觉统一
 *   - ToggleRow/NumberRow/TimeRow 为私有受控小组件,onChange 只回传 patch,不落盘
 *   - 免打扰时间用本地草稿输入,失焦/回车经 normalizeTimeDraft 归一化提交(空串↔null)
 *   - hooks 全部在 early return 之前(项目规则 20)
 */
import { useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Input, Pill } from '@/components/primitives';
import { CheckIcon, XIcon } from '@/lib/icons';
import type { HealthForm } from './settingsState';
import type { HealthConfig } from '@/lib/types';
import styles from './Settings.module.css';

/** HH:MM 24 小时制校验 */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 归一化免打扰时间草稿
 *
 * Business Logic: 免打扰时间需支持 `09:30`/`9:30`/`0930`/`930` 多种输入,提交时统一为 HH:MM。
 * Code Logic: 空串→null;合法 HH:MM 原样;带冒号或纯数字按位解析;不合法→undefined(回滚)。
 */
export function normalizeTimeDraft(draft: string): string | null | undefined {
  const trimmed = draft.trim();
  if (trimmed === '') return null;
  if (TIME_PATTERN.test(trimmed)) return trimmed;

  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const hour = Number(colonMatch[1]);
    const minute = Number(colonMatch[2]);
    if (hour <= 23 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
    return undefined;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 3 || digits.length === 4) {
    const splitAt = digits.length - 2;
    const hour = Number(digits.slice(0, splitAt));
    const minute = Number(digits.slice(splitAt));
    if (hour <= 23 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }

  return undefined;
}

interface HealthPanelProps {
  /** 当前表单值 */
  form: HealthForm;
  /** 最近已应用配置快照(显示用) */
  applied: HealthConfig | null;
  /** 字段变更(浅合并,只改本地表单) */
  onPatch: (partial: Partial<HealthForm>) => void;
  /** 恢复默认 */
  onResetDefaults: () => void;
  /** 应用配置(整体提交) */
  onApply: () => void;
  /** 应用中 */
  applying: boolean;
  /** 错误提示 */
  error: string | null;
}

interface ToggleRowProps {
  label: string;
  helper: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
}

interface NumberRowProps {
  label: string;
  helper: string;
  value: number;
  min: number;
  max?: number;
  onChange: (next: number) => void;
}

interface TimeRowProps {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
}

/** 渲染开关行(复用设置页 toggleRow + Pill 风格,与同步/AI 一致) */
function ToggleRow({ label, helper, checked, onToggle }: ToggleRowProps) {
  return (
    <button
      type="button"
      className={styles.toggleRow}
      onClick={() => onToggle(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <div className={styles.toggleText}>
        <span className={styles.toggleLabel}>{label}</span>
        <span className={styles.toggleHelper}>{helper}</span>
      </div>
      <span className={styles.toggleState}>
        {checked ? (
          <Pill tone="success" dot>
            <CheckIcon size={12} />
          </Pill>
        ) : (
          <Pill tone="neutral" dot>
            <XIcon size={12} />
          </Pill>
        )}
      </span>
    </button>
  );
}

/** 渲染数字配置行(复用 field + label + Input + helper) */
function NumberRow({ label, helper, value, min, max, onChange }: NumberRowProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <Input
        type="number"
        mono
        min={min}
        max={max}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
      />
      <p className={styles.helper}>{helper}</p>
    </div>
  );
}

/** 渲染免打扰时间行(本地草稿,失焦/回车归一化提交) */
function TimeRow({ label, value, onChange }: TimeRowProps) {
  const [draft, setDraft] = useState(value ?? '');

  const commitDraft = () => {
    const next = normalizeTimeDraft(draft);
    if (next === undefined) {
      setDraft(value ?? '');
      return;
    }
    setDraft(next ?? '');
    if (next !== value) onChange(next);
  };

  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <Input
        type="text"
        size="sm"
        mono
        inputMode="numeric"
        placeholder="HH:MM"
        value={draft}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </div>
  );
}

/** 分组标题 */
function GroupTitle({ children }: { children: ReactNode }) {
  return <h3 className={styles.sectionTitle}>{children}</h3>;
}

/**
 * 健康提醒设置面板组件
 *
 * @returns 监测/提醒/免打扰/隐私 四组受控字段 + 恢复默认/应用配置按钮
 */
export function HealthPanel({
  form,
  applied,
  onPatch,
  onResetDefaults,
  onApply,
  applying,
  error,
}: HealthPanelProps) {
  const { t } = useTranslation(['settings', 'health', 'common']);

  return (
    <Card variant="flat" padding="md">
      <Card.Header>
        <h2 className={styles.sectionTitle}>{t('settings:health.title')}</h2>
      </Card.Header>
      <Card.Body padding="md">
        <p className={styles.helper}>{t('settings:health.subtitle')}</p>

        {/* 监测 */}
        <GroupTitle>{t('health:monitoringGroup')}</GroupTitle>
        <div className={styles.toggleList}>
          <ToggleRow
            label={t('health:enabled')}
            helper={t('health:enabledDescription')}
            checked={form.enabled}
            onToggle={(v) => onPatch({ enabled: v })}
          />
        </div>
        <NumberRow
          label={t('health:workWindowMinutes')}
          helper={t('health:workWindowDescription')}
          min={1}
          max={120}
          value={Math.round(form.workWindowSeconds / 60)}
          onChange={(v) => onPatch({ workWindowSeconds: v * 60 })}
        />
        <NumberRow
          label={t('health:breakMinutes')}
          helper={t('health:breakDescription')}
          min={1}
          value={Math.round(form.breakSeconds / 60)}
          onChange={(v) => onPatch({ breakSeconds: v * 60 })}
        />

        {/* 提醒 */}
        <GroupTitle>{t('health:reminderGroup')}</GroupTitle>
        <div className={styles.toggleList}>
          <ToggleRow
            label={t('health:notifyEnabled')}
            helper={t('health:notifyDescription')}
            checked={form.notifyEnabled}
            onToggle={(v) => onPatch({ notifyEnabled: v })}
          />
          <ToggleRow
            label={t('health:reminderFullscreen')}
            helper={t('health:fullscreenDescription')}
            checked={form.reminderFullscreen}
            onToggle={(v) => onPatch({ reminderFullscreen: v })}
          />
          <ToggleRow
            label={t('health:waterEnabled')}
            helper={t('health:waterDescription')}
            checked={form.waterEnabled}
            onToggle={(v) => onPatch({ waterEnabled: v })}
          />
        </div>
        <NumberRow
          label={t('health:waterIntervalMinutes')}
          helper={t('health:waterIntervalDescription')}
          min={1}
          value={Math.round(form.waterIntervalSeconds / 60)}
          onChange={(v) => onPatch({ waterIntervalSeconds: v * 60 })}
        />

        {/* 免打扰时段 */}
        <GroupTitle>{t('health:quietHoursGroup')}</GroupTitle>
        <TimeRow
          label={t('health:dndStart')}
          value={form.dndStart}
          onChange={(v) => onPatch({ dndStart: v })}
        />
        <TimeRow
          label={t('health:dndEnd')}
          value={form.dndEnd}
          onChange={(v) => onPatch({ dndEnd: v })}
        />

        {/* 隐私 */}
        <GroupTitle>{t('health:privacyGroup')}</GroupTitle>
        <div className={styles.toggleList}>
          <ToggleRow
            label={t('health:recordWindowTitle')}
            helper={t('health:recordWindowTitleDescription')}
            checked={form.recordWindowTitle}
            onToggle={(v) => onPatch({ recordWindowTitle: v })}
          />
        </div>
        <NumberRow
          label={t('health:retainDays')}
          helper={t('health:retainDaysDescription')}
          min={1}
          value={form.retainDays}
          onChange={(v) => onPatch({ retainDays: v })}
        />

        {/* 已应用配置快照 */}
        {applied ? (
          <div className={styles.metaRow}>
            <span className={styles.metaKey}>{t('settings:health.appliedConfig')}</span>
            <span className={styles.metaValue}>
              {applied.enabled ? t('settings:sync.enabled') : t('settings:sync.disabled')}
              {` · ${Math.round(applied.workWindowSeconds / 60)}m / ${Math.round(applied.breakSeconds / 60)}m`}
            </span>
          </div>
        ) : null}

        {/* 按钮组 */}
        <div className={styles.aboutActions}>
          <Button
            variant="ghost"
            size="md"
            onClick={onResetDefaults}
            disabled={applying}
          >
            {t('settings:action.resetDefault')}
          </Button>
          <Button variant="primary" size="md" onClick={onApply} disabled={applying}>
            {applying ? t('settings:action.applying') : t('settings:action.apply')}
          </Button>
        </div>

        {error ? <span className={styles.updateError}>{error}</span> : null}
      </Card.Body>
    </Card>
  );
}

HealthPanel.displayName = 'HealthPanel';
```

> 上面 `<Button>` 需在顶部 import 加入 `Button`:`import { Card, Button, Input, Pill } from '@/components/primitives';`。`sectionTitle` 类已存在于 `Settings.module.css`。`t('settings:sync.enabled'/'disabled')` 复用现有 key。

- [ ] **Step 4: 运行 normalizeTimeDraft 测试确认通过**

Run: `cd web && npx tsx src/pages/Settings/HealthPanel.test.ts`
Expected: PASS(全部 9 用例)。

- [ ] **Step 5: 类型校验**

Run: `cd web && npx tsc --noEmit`
Expected: 无 error。

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Settings/HealthPanel.tsx web/src/pages/Settings/HealthPanel.test.ts
git commit -m "feat(settings): 新增 HealthPanel 健康提醒 tab 渲染组件 + normalizeTimeDraft"
```

---

### Task 6: `Settings.tsx` 集成(tabs + 深链 + health 状态 + 渲染 + 常规按钮改名)

**Files:**
- Modify: `web/src/pages/Settings/Settings.tsx`

**Interfaces:**
- Consumes: `HealthPanel`、`HealthForm`/`PENDING_HEALTH_FORM`/`healthConfigToForm`、`healthApi.getDefaultConfig`、i18n `settings:tabs.health`/`settings:action.apply`/`applying`。
- Produces:设置页新增「健康提醒」tab;常规页底部按钮文案改「应用配置」;`/settings?tab=health` 深链激活。

- [ ] **Step 1: import 区补依赖**

文件顶部 import 块追加(与现有 react-router 使用一致,确认 `useSearchParams` 来自 `react-router-dom`):

```ts
import { useSearchParams } from 'react-router-dom';
import { healthApi } from '@/api/health';
import { HealthPanel } from './HealthPanel';
```

`./settingsState` 的 import 命名导入追加 `HealthForm`、`PENDING_HEALTH_FORM`、`healthConfigToForm`(并入现有大括号 import)。

- [ ] **Step 2: `SettingsTabId` + `SETTINGS_TABS` 调整**

```ts
type SettingsTabId = 'general' | 'health' | 'sync' | 'ai' | 'about';
```

```ts
const SETTINGS_TABS: SettingsTab[] = [
  { id: 'general', labelKey: 'general' },
  { id: 'health', labelKey: 'health' },
  { id: 'sync', labelKey: 'sync' },
  { id: 'ai', labelKey: 'ai' },
  { id: 'about', labelKey: 'about' },
];
```

- [ ] **Step 3: activeTab 深链初值 + health 顶层状态**

在现有 `useState` 区块:
- 把 `const [activeTab, setActiveTab] = useState<SettingsTabId>('general');` 改为从查询参数取初值。紧邻其上方加 `const [searchParams] = useSearchParams();`,并把 activeTab 改为:

```ts
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<SettingsTabId>(
    initialTab === 'health' || initialTab === 'sync' || initialTab === 'ai' || initialTab === 'about'
      ? (initialTab as SettingsTabId)
      : 'general',
  );
```

> 注意 `useSearchParams` 必须在所有 early return 之前(它已是组件顶部 useState 区,合规)。

在 githubTrending 状态块之后、`usePermissions` 之前,新增 health 状态:

```ts
  // 健康提醒配置:独立表单编辑 + 恢复默认 + 应用配置(与同步/AI 同模式)。
  const [healthForm, setHealthForm] = useState<HealthForm>({ ...PENDING_HEALTH_FORM });
  const [defaultHealthForm, setDefaultHealthForm] = useState<HealthForm>({ ...PENDING_HEALTH_FORM });
  const [healthConfig, setHealthConfig] = useState<HealthConfig | null>(null);
  const [applyingHealth, setApplyingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
```

> 顶部 type import 块(`import type { ... } from '@/lib/types';`)追加 `HealthConfig`。

- [ ] **Step 4: loadConfig 并行加载 health 配置**

在 `loadConfig` 的 `Promise.all` 数组末尾(`githubTrendingApi.getDefaultConfig()` 之后)追加两项:

```ts
          healthApi.getConfig(),
          healthApi.getDefaultConfig(),
```

并把解构变量数组相应追加两项,在 `if (cancelled) return;` 之后、`setState(loaded)` 附近补充初始化(放 GitHub Trending 初始化之后):

```ts
        const [
          config,
          defaultConfig,
          version,
          cloudSyncConfig,
          defaultCloudSyncConfig,
          githubTrendingLoaded,
          defaultGithubTrendingLoaded,
          healthLoaded,
          defaultHealthLoaded,
        ] = await Promise.all([ /* ...原 7 项..., */
          // ...,
          healthApi.getConfig(),
          healthApi.getDefaultConfig(),
        ]);
```

```ts
        // 健康提醒:初始化已应用配置与受控表单值 + 默认表单
        setHealthConfig(healthLoaded);
        setHealthForm(healthConfigToForm(healthLoaded));
        setDefaultHealthForm(healthConfigToForm(defaultHealthLoaded));
```

- [ ] **Step 5: 新增 health handlers**

在 `handleApplyGithubTrending`/`handleTestClaudeCli` 附近新增:

```ts
  /**
   * 更新健康提醒表单字段(浅合并,只改本地,不落盘)
   */
  const patchHealthForm = useCallback((partial: Partial<HealthForm>) => {
    setHealthForm((prev) => ({ ...prev, ...partial }));
  }, []);

  /**
   * 健康提醒「恢复默认」:把表单重置为后端默认配置
   *
   * Business Logic: 健康 tab 用户改过工作窗口/提醒等,需随时回到应用内置默认。
   * Code Logic: 用加载时保存的默认表单快照覆盖当前表单;持久化仍由「应用配置」完成。
   */
  const handleResetHealthDefaults = useCallback(() => {
    setHealthForm(defaultHealthForm);
    setHealthError(null);
  }, [defaultHealthForm]);

  /**
   * 健康提醒「应用配置」:整体提交表单到后端并用返回值刷新已应用快照
   */
  const handleApplyHealth = async () => {
    setApplyingHealth(true);
    setHealthError(null);
    try {
      const updated = await healthApi.updateConfig(healthForm);
      setHealthConfig(updated);
      setHealthForm(healthConfigToForm(updated));
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : t('settings:health.applyFailed'));
    } finally {
      setApplyingHealth(false);
    }
  };
```

- [ ] **Step 6: 渲染 health tab panel**

在 `{activeTab === 'sync' ? ( ... ) : null}` 之前插入 health panel 分支:

```tsx
        {activeTab === 'health' ? (
          <div
            id="settings-panel-health"
            className={styles.tabPanel}
            role="tabpanel"
            aria-labelledby="settings-tab-health"
          >
            <HealthPanel
              form={healthForm}
              applied={healthConfig}
              onPatch={patchHealthForm}
              onResetDefaults={handleResetHealthDefaults}
              onApply={handleApplyHealth}
              applying={applyingHealth}
              error={healthError}
            />
          </div>
        ) : null}
```

- [ ] **Step 7: 常规页底部按钮改名 save → apply**

在常规 tab 的 `<div className={styles.footer}>` 按钮组中,把保存按钮:

```tsx
            <Button variant="primary" onClick={handleSave} disabled={!isDirty || saving}>
              {saving ? t('settings:action.saving') : t('settings:action.save')}
            </Button>
```

改为:

```tsx
            <Button variant="primary" onClick={handleSave} disabled={!isDirty || saving}>
              {saving ? t('settings:action.applying') : t('settings:action.apply')}
            </Button>
```

> `handleSave`/`saving` 变量名保留(内部仍是保存语义,仅文案改);如项目偏好变量名也对齐,可后续重命名,本任务不动以缩小 diff。

- [ ] **Step 8: 构建校验(tsc + vite + i18n key 校验)**

Run: `cd web && npm run build`
Expected: 构建成功,tsc 无 `action.save`/`action.saving`/`tabs.health` 缺失报错。

- [ ] **Step 9: Commit**

```bash
git add web/src/pages/Settings/Settings.tsx
git commit -m "feat(settings): 新增健康提醒 tab + 深链激活 + 常规页按钮改「应用配置」"
```

---

### Task 7: `Health.tsx` 监控页改造(移除内嵌表单 + 配置跳转)

**Files:**
- Modify: `web/src/pages/Health/Health.tsx`

**Interfaces:**
- Consumes: `react-router-dom` 的 `useNavigate`、i18n `health:goToSettings`。

- [ ] **Step 1: 移除 Settings import 与渲染**

删除顶部 `import { Settings } from './Settings';`(line 25)。删除文件末尾 `<Settings />`(line 294)。

- [ ] **Step 2: 加 useNavigate + 配置按钮**

顶部 import 追加:

```ts
import { useNavigate } from 'react-router-dom';
```

在组件内 `const { t } = useTranslation(...)` 之后加:

```ts
  const navigate = useNavigate();
```

在 header 的 `headerActions` 内、「启用/停用监测」按钮之前插入「配置」按钮:

```tsx
          <div className={styles.headerActions}>
            <Button
              variant="secondary"
              size="md"
              onClick={() => navigate('/settings?tab=health')}
            >
              {t('health:goToSettings')}
            </Button>
            <Button
              variant={status.enabled ? 'secondary' : 'primary'}
              size="md"
              icon={<HealthIcon />}
              onClick={toggleEnabled}
            >
              {status.enabled ? t('health:disableMonitoring') : t('health:enableMonitoring')}
            </Button>
          </div>
```

- [ ] **Step 3: 构建校验**

Run: `cd web && npm run build`
Expected: 成功(确认无残留 `Settings` 引用)。

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/Health/Health.tsx
git commit -m "refactor(health): 监控页移除内嵌配置表单,新增「配置」跳转设置页深链"
```

---

### Task 8: 删除旧文件 + 清理 i18n 残留 key

**Files:**
- Delete: `web/src/pages/Health/Settings.tsx`
- Delete: `web/src/pages/Health/Settings.module.css`
- 已在 Task 2 删除 `settings.action.save`/`saving`(确认无遗漏)

- [ ] **Step 1: 确认无其他引用**

Run: `cd web && grep -rn "pages/Health/Settings" src || echo "no refs"`
Expected: `no refs`(原仅 Health.tsx 引用,Task 7 已移除)。

- [ ] **Step 2: 删除文件**

Run: `cd web && git rm src/pages/Health/Settings.tsx src/pages/Health/Settings.module.css`

- [ ] **Step 3: 确认 save/saving 已清理**

Run: `cd web && grep -rn "action.save\b\|action.saving\b" src || echo "clean"`
Expected: `clean`。

- [ ] **Step 4: 构建校验**

Run: `cd web && npm run build && npm run lint`
Expected: 成功。

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(health): 删除已迁移的 Health/Settings.tsx 与样式"
```

---

### Task 9: 项目记忆(CLAUDE.md)同步

**Files:**
- Modify: `web/CLAUDE.md`
- Modify: `src-tauri/CLAUDE.md`

- [ ] **Step 1: web/CLAUDE.md — Settings 页描述**

把 Settings 页描述中 tab 列表「常规 / 同步 / AI / 关于」改为「常规 / 健康提醒 / 同步 / AI / 关于」;「底部统一 Save」改为「底部统一『应用配置』」;补一句:健康提醒 tab 由 `HealthPanel`(`src/pages/Settings/HealthPanel.tsx`)渲染完整配置表单,表单编辑 + 恢复默认(`get_default_health_config`)+ 应用配置(`update_health_config` 整体提交),复用设置页通用样式;支持深链 `/settings?tab=health` 由监控页「配置」按钮触发。

- [ ] **Step 2: web/CLAUDE.md — Health 页描述**

把 Health 页描述中「+ 完整配置表单」移除,改为「状态监控页:状态概览 + 启用/暂停 + 今日活跃统计 + app 排行图表 + 小时分布;头部「配置」按钮跳转 `/settings?tab=health`」。说明配置已迁移至设置页健康提醒 tab,`healthApi` 新增 `getDefaultConfig`。

- [ ] **Step 3: web/CLAUDE.md — healthApi 与 settingsState 条目**

`healthApi` 命令清单补 `get_default_health_config`;`settingsState` 提到新增 `HealthForm`/`PENDING_HEALTH_FORM`/`healthConfigToForm`。

- [ ] **Step 4: src-tauri/CLAUDE.md — 健康提醒命令层**

在「命令层(commands/health.rs...)」清单中 `get_health_config` 之后补:`get_default_health_config → HealthConfigDto(默认值,供设置页恢复默认,复用 HealthConfig::default())`;并把该节"11 命令"/"12 命令"表述与 lib.rs 注释一致(12 命令)。

- [ ] **Step 5: Commit**

```bash
git add web/CLAUDE.md src-tauri/CLAUDE.md
git commit -m "docs: CLAUDE.md 同步健康提醒设置迁移"
```

---

### Task 10: 全量验证

- [ ] **Step 1: 后端**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings`
Expected: 全部测试通过,clippy 无 warning。

- [ ] **Step 2: 前端纯函数测试**

Run: `cd web && npx tsx src/pages/Settings/settingsState.test.ts && npx tsx src/pages/Settings/HealthPanel.test.ts`
Expected: 全部 PASS。

- [ ] **Step 3: 前端构建 + lint**

Run: `cd web && npm run build && npm run lint`
Expected: 成功。

- [ ] **Step 4: 手动验证点(需人工,规则 11)**

启动 `./web/node_modules/.bin/tauri dev`,核对:
1. 设置页出现「健康提醒」tab(常规之后),含监测/提醒/免打扰/隐私四组字段 + 「恢复默认」「应用配置」按钮。
2. 改字段 → 点「应用配置」→ 配置落盘(重启应用后仍生效)。
3. 「恢复默认」→ 表单回到后端默认值。
4. 常规页底部按钮文案为「应用配置」(非「保存」),中英文切换正确。
5. 监控页(侧栏健康提醒)无配置表单;头部「配置」按钮跳转设置页且默认打开健康提醒 tab。
6. 久坐提醒/喝水提醒/全屏遮罩仍正常触发(配置迁移不应影响 daemon)。

---

## Self-Review 记录

- **Spec 覆盖**:后端命令(T1)、i18n(T2)、settingsState(T3)、API(T4)、HealthPanel+normalizeTimeDraft(T5)、Settings 集成 + 深链 + 按钮改名(T6)、监控页改造(T7)、删除清理(T8)、CLAUDE.md(T9)、验证(T10)——spec 第 3-6 节全部有 task 对应。
- **占位扫描**:无 TBD/TODO;每个代码步骤均含完整代码。
- **类型一致性**:`HealthForm = HealthConfig`(T3 定义),`HealthPanel` props 与 `Settings.tsx` 传参一致(form/onPatch/onResetDefaults/onApply/applying/error/applied);`healthApi.getDefaultConfig`/`updateConfig` 签名与 health.ts 一致;后端 `HealthConfigDto`/`From<HealthConfig>` 复用既有。
