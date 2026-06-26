# Workbench YAML File Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class YAML highlighting, formatting, and save-before semantic validation to the Workbench file workspace.

**Architecture:** YAML becomes a structured file type beside JSON and TOML. The frontend owns fast editor feedback and formatting UX; the Rust backend owns authoritative file detection, capability reporting, save validation, and formatting.

**Tech Stack:** React 19, TypeScript, Vite, CodeMirror 6, npm `yaml`, Rust, Tauri 2, `serde_yaml`.

---

## Files

- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/api/workbench.ts`
- Modify: `web/src/pages/Workbench/workbenchFiles.ts`
- Modify: `web/src/pages/Workbench/workbenchFiles.test.ts`
- Modify: `web/src/pages/Workbench/Workbench.tsx`
- Modify: `web/src/components/domain/WorkbenchCodeEditor/WorkbenchCodeEditor.tsx`
- Modify: `web/src/components/domain/WorkbenchCodeEditor/workbenchCodeEditorTheme.test.ts`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/src/workbench/models.rs`
- Modify: `src-tauri/src/workbench/file_preview.rs`
- Modify: `src-tauri/src/workbench/file_content.rs`
- Modify: `src-tauri/src/commands/workbench.rs`
- Modify: `docs/prd.md`
- Modify: `web/CLAUDE.md`
- Modify: `src-tauri/CLAUDE.md`

## Task 1: Frontend YAML Type, Capabilities, Formatting, And Highlighting

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/api/workbench.ts`
- Modify: `web/src/pages/Workbench/workbenchFiles.ts`
- Modify: `web/src/pages/Workbench/workbenchFiles.test.ts`
- Modify: `web/src/pages/Workbench/Workbench.tsx`
- Modify: `web/src/components/domain/WorkbenchCodeEditor/WorkbenchCodeEditor.tsx`
- Modify: `web/src/components/domain/WorkbenchCodeEditor/workbenchCodeEditorTheme.test.ts`

- [ ] **Step 1: Add dependencies**

Run:

```bash
cd web
npm install @codemirror/lang-yaml yaml
```

Expected: `package.json` and `package-lock.json` gain `@codemirror/lang-yaml` and `yaml`.

- [ ] **Step 2: Write failing frontend tests**

Add tests in `web/src/pages/Workbench/workbenchFiles.test.ts` that assert:

```ts
assert.equal(detectWorkbenchFileType('config.yaml', 'file'), 'yaml');
assert.equal(detectWorkbenchFileType('workflow.yml', 'file'), 'yaml');

const yamlCapabilities = FILE_CAPABILITIES.yaml;
assert.equal(yamlCapabilities.canEdit, true);
assert.equal(yamlCapabilities.canFormat, true);
assert.equal(yamlCapabilities.mustValidateBeforeSave, true);
```

Add CodeMirror test coverage in `web/src/components/domain/WorkbenchCodeEditor/workbenchCodeEditorTheme.test.ts` or the closest existing editor test helper for a YAML language input:

```ts
const extensions = getWorkbenchCodeEditorLanguageExtensions('yaml');
assert.ok(extensions.length > 0);
```

Run:

```bash
cd web
npx --yes tsx src/pages/Workbench/workbenchFiles.test.ts
npx --yes tsx src/components/domain/WorkbenchCodeEditor/workbenchCodeEditorTheme.test.ts
```

Expected: tests fail because `yaml` is not a known type / language yet.

- [ ] **Step 3: Implement frontend YAML support**

Implementation requirements:

- Extend `WorkbenchDetectedFileType` unions in `web/src/lib/types.ts` and `web/src/pages/Workbench/workbenchFiles.ts` with `yaml`.
- Move `yaml` and `yml` out of generic code detection by checking them before `CODE_EXTENSIONS`.
- Add `FILE_CAPABILITIES.yaml` with the same editable structured behavior as JSON/TOML:

```ts
yaml: {
  canPreview: true,
  canEdit: true,
  canSave: true,
  canFormat: true,
  mustValidateBeforeSave: true,
}
```

- Extend `workbenchApi.files.formatStructured` kind from `'json' | 'toml'` to `'json' | 'toml' | 'yaml'`.
- In `Workbench.tsx`, include `yaml` anywhere structured validation/formatting currently branches on JSON/TOML.
- Use npm `yaml` for frontend helper logic:

```ts
import { parseDocument } from 'yaml';

export function validateYamlText(content: string): string | null {
  const document = parseDocument(content, { prettyErrors: false });
  const firstError = document.errors[0];
  return firstError ? firstError.message : null;
}

export function formatYamlText(content: string): string {
  const document = parseDocument(content, { prettyErrors: false });
  if (document.errors.length > 0) {
    throw new Error(document.errors[0].message);
  }
  return document.toString();
}
```

- Import `yaml` from `@codemirror/lang-yaml` in `WorkbenchCodeEditor.tsx` and return it for language/type `yaml`, `yml`.
- Export a small testable helper such as `getWorkbenchCodeEditorLanguageExtensions(language?: string)` if the editor currently keeps language selection private.

- [ ] **Step 4: Verify frontend tests pass**

Run:

```bash
cd web
npx --yes tsx src/pages/Workbench/workbenchFiles.test.ts
npx --yes tsx src/components/domain/WorkbenchCodeEditor/workbenchCodeEditorTheme.test.ts
```

Expected: both commands pass.

## Task 2: Rust YAML Detection, Formatting, And Save Validation

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/src/workbench/models.rs`
- Modify: `src-tauri/src/workbench/file_preview.rs`
- Modify: `src-tauri/src/workbench/file_content.rs`
- Modify: `src-tauri/src/commands/workbench.rs`

- [ ] **Step 1: Add dependency**

Run:

```bash
cd src-tauri
cargo add serde_yaml
```

Expected: `Cargo.toml` and `Cargo.lock` include `serde_yaml`.

- [ ] **Step 2: Write failing Rust tests**

Add or extend tests so these behaviors are covered:

```rust
assert_eq!(detect_file_type(Path::new("config.yaml"), false), WorkbenchDetectedFileType::Yaml);
assert_eq!(detect_file_type(Path::new("workflow.yml"), false), WorkbenchDetectedFileType::Yaml);

let formatted = format_structured_content("yaml", "name: app\nitems:\n- one\n")?;
assert!(formatted.contains("name: app"));
assert!(format_structured_content("yaml", "name: [").is_err());
```

Add command-level validation coverage for a `.yaml` path if `commands/workbench.rs` already has save validation tests.

Run relevant tests:

```bash
cd src-tauri
cargo test workbench::file_preview --lib
cargo test workbench::file_content --lib
cargo test commands::workbench --lib
```

Expected: tests fail because YAML is not implemented.

- [ ] **Step 3: Implement Rust YAML support**

Implementation requirements:

- Add `Yaml` to `WorkbenchDetectedFileType` with camelCase serde output `yaml`.
- Update file detection in `file_preview.rs` so `yaml` and `yml` map to `Yaml`.
- Give `Yaml` the same editable structured capabilities as JSON/TOML.
- Update `format_structured_content`:

```rust
"yaml" | "yml" => {
    let parsed: serde_yaml::Value = serde_yaml::from_str(content)
        .map_err(|err| AppError::validation(format!("YAML 语法错误: {}", err)))?;
    let mut formatted = serde_yaml::to_string(&parsed)
        .map_err(|err| AppError::validation(format!("YAML 格式化失败: {}", err)))?;
    if !formatted.ends_with('\n') {
        formatted.push('\n');
    }
    Ok(formatted)
}
```

- Update save-before validation in `commands/workbench.rs` so YAML requires parse validation when saving.

- [ ] **Step 4: Verify Rust tests pass**

Run:

```bash
cd src-tauri
cargo test workbench::file_preview --lib
cargo test workbench::file_content --lib
cargo test commands::workbench --lib
```

Expected: all three commands pass.

## Task 3: Documentation, Integration Verification, And Commit

**Files:**
- Modify: `docs/prd.md`
- Modify: `web/CLAUDE.md`
- Modify: `src-tauri/CLAUDE.md`

- [ ] **Step 1: Update docs**

Update docs so they say Workbench structured text support includes JSON, TOML, and YAML. Keep project memory concise:

- `docs/prd.md`: product requirement now includes YAML code highlighting, formatting, and save-before semantic validation.
- `web/CLAUDE.md`: Workbench files API/editor notes include JSON/TOML/YAML structured formatting and YAML CodeMirror language support; Workbench test command note includes any new/updated test.
- `src-tauri/CLAUDE.md`: Workbench backend notes include YAML detection, capabilities, formatting, and save-before validation.

- [ ] **Step 2: Run integration verification**

Run:

```bash
cd web
npx --yes tsx src/pages/Workbench/workbenchFiles.test.ts
npx --yes tsx src/components/domain/WorkbenchCodeEditor/workbenchCodeEditorTheme.test.ts
npm run lint
npm run build

cd ../src-tauri
cargo test workbench::file_preview --lib
cargo test workbench::file_content --lib
cargo test commands::workbench --lib
cargo check

cd ..
git diff --check
```

Expected: all commands pass. `npm run build` may keep the existing Vite large chunk warning; do not treat that as failure.

- [ ] **Step 3: Commit**

Run:

```bash
git status --short
git add docs/superpowers/specs/2026-06-26-workbench-yaml-file-support-design.md docs/superpowers/plans/2026-06-26-workbench-yaml-file-support.md docs/prd.md web src-tauri
git commit -m "feat: support yaml workbench files"
```

Expected: commit succeeds and working tree is clean.
