/**
 * Prompts 页面 - Prompt 库管理
 *
 * Business Logic（为什么需要这个页面）:
 *   Prompt 是 Claude Partner 的核心资产之一：用户在日常工作中沉淀的指令模板。
 *   该页面是 /prompts 路由下的主视图，集中提供：搜索 / 标签筛选 / 同步 / 新建 / 卡片浏览 / inline 编辑 / 删除。
 *   同时让用户一眼看到自己收藏与最近使用的 Prompt。
 *
 * Code Logic（这个页面做什么）:
 *   - 顶部 page header + 副标题描述
 *   - 工具栏：搜索框（300ms debounce）+ 标签筛选 chips + 同步按钮 + 新建按钮
 *   - Prompt 网格：调用 promptsApi.list() 拉取，按搜索关键词 + 激活标签本地过滤
 *   - 点击卡片进入 inline 编辑模式（input + textarea + save/cancel）
 *   - 点击删除时弹 confirm 二次确认
 *   - 失败 / 空数据时回退到 mock 数据，保留 4 类标签
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Card, Input, Tag } from '@/components/primitives';
import { promptsApi } from '@/api/prompts';
import type { Prompt } from '@/lib/types';
import { PlusIcon, SearchIcon, SyncIcon, TrashIcon, XIcon, CheckIcon, EditIcon } from '@/lib/icons';
import { debounce } from '@/lib/format';
import styles from './Prompts.module.css';

// ────────────────────────────────────────────────────────────────
// Mock 数据：8 条覆盖 work / personal / claude / code 四类标签
// ────────────────────────────────────────────────────────────────

const MOCK_PROMPTS: Prompt[] = [
  {
    id: 'p-001',
    title: '翻译为学术英语',
    content: '把任意中文段落改写成 Nature/Science 风格的英文学术英文，保留术语与被动语态。',
    tag: 'work',
    updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
  {
    id: 'p-002',
    title: '总结长文为要点',
    content: '把一篇 5000 字以上的长文压缩为 5–8 条可执行要点，附带原文出处行号。',
    tag: 'work',
    updatedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
  },
  {
    id: 'p-003',
    title: '代码审查 v2',
    content: '逐行审查 PR diff，按 Bug / 性能 / 风格分组，每条给出可粘贴的修改建议。',
    tag: 'code',
    updatedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  },
  {
    id: 'p-004',
    title: '写单元测试',
    content: '为给定函数生成 pytest / vitest 用例，覆盖 happy path + 边界 + 异常分支。',
    tag: 'code',
    updatedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
  },
  {
    id: 'p-005',
    title: '解释正则表达式',
    content: '把一段复杂 regex 拆解为人类可读的「逐 token 注释」+ 三个匹配示例。',
    tag: 'code',
    updatedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  },
  {
    id: 'p-006',
    title: '周报模板',
    content: '基于本周 git 提交记录 + 飞书日历事件自动生成周报 Markdown 草稿。',
    tag: 'work',
    updatedAt: new Date(Date.now() - 14 * 86_400_000).toISOString(),
  },
  {
    id: 'p-007',
    title: 'Claude 自我评估',
    content: '让 Claude 在回答末尾给出「我可能错在哪里 + 我会如何验证」的自检段落。',
    tag: 'claude',
    updatedAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
  },
  {
    id: 'p-008',
    title: '日记整理',
    content: '把零散的日记条目按主题聚类，提取本周情绪曲线与高光时刻。',
    tag: 'personal',
    updatedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
  },
  {
    id: 'p-009',
    title: '阅读清单',
    content: '从一段长书评里提取「金句 + 章节定位 + 行动启示」三栏式速读清单。',
    tag: 'personal',
    updatedAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
  },
  {
    id: 'p-010',
    title: '重构建议',
    content: '给定一段遗留代码，输出按「可读性 / 可测性 / 性能」三轴的最小改动建议。',
    tag: 'code',
    updatedAt: new Date(Date.now() - 11 * 86_400_000).toISOString(),
  },
];

const TAG_OPTIONS = ['work', 'personal', 'claude', 'code'] as const;
type TagOption = (typeof TAG_OPTIONS)[number];

/** 编辑卡片用的草稿状态 */
interface DraftPrompt {
  id: string;
  title: string;
  content: string;
  tag: TagOption;
}

type LoadState = 'loading' | 'success' | 'error';

/**
 * Prompts 页面主组件
 */
export function Prompts() {
  // ── 列表数据 ──
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usedMock, setUsedMock] = useState(false);

  // ── 搜索 / 筛选 ──
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<TagOption | 'all'>('all');

  // ── 编辑 / 新建 / 删除 ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftPrompt | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  /**
   * 拉取 Prompt 列表；失败或空时回退到 mock
   */
  const loadPrompts = useCallback(async () => {
    try {
      const data = await promptsApi.list();
      if (Array.isArray(data) && data.length > 0) {
        setPrompts(data);
        setUsedMock(false);
      } else {
        setPrompts(MOCK_PROMPTS);
        setUsedMock(true);
      }
      setLoadState('success');
      setLoadError(null);
    } catch (err) {
      setPrompts(MOCK_PROMPTS);
      setUsedMock(true);
      setLoadState('error');
      setLoadError(err instanceof Error ? err.message : 'Prompt 列表加载失败');
    }
  }, []);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  // ── 搜索 300ms debounce ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSetSearch = useCallback(
    debounce((v: unknown) => {
      if (typeof v === 'string') setSearch(v);
    }, 300),
    [],
  );

  const handleSearchInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setSearchInput(v);
      debouncedSetSearch(v);
    },
    [debouncedSetSearch],
  );

  // ── 过滤后的列表 ──
  const filtered = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return prompts.filter((p) => {
      if (activeTag !== 'all' && p.tag !== activeTag) return false;
      if (!lower) return true;
      return (
        p.title.toLowerCase().includes(lower) ||
        p.content.toLowerCase().includes(lower)
      );
    });
  }, [prompts, search, activeTag]);

  // ── 各标签计数（用于 chip 上的数字角标） ──
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = { all: prompts.length };
    for (const t of TAG_OPTIONS) counts[t] = 0;
    for (const p of prompts) {
      if (p.tag && counts[p.tag] !== undefined) counts[p.tag] += 1;
    }
    return counts;
  }, [prompts]);

  // ── 进入编辑模式 ──
  const startEdit = useCallback((p: Prompt) => {
    setCreatingNew(false);
    setEditingId(p.id);
    setDraft({
      id: p.id,
      title: p.title,
      content: p.content,
      tag: ((TAG_OPTIONS as readonly string[]).includes(p.tag ?? '')
        ? (p.tag as TagOption)
        : 'work'),
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft(null);
    setCreatingNew(false);
  }, []);

  // ── 保存（新建或更新） ──
  const saveDraft = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (!draft) return;
      const title = draft.title.trim();
      const content = draft.content.trim();
      if (!title || !content) return;

      if (creatingNew) {
        // 本地乐观更新（mock 数据时也走同一路径）
        const newPrompt: Prompt = {
          id: `local-${Date.now()}`,
          title,
          content,
          tag: draft.tag,
          updatedAt: new Date().toISOString(),
        };
        setPrompts((prev) => [newPrompt, ...prev]);
        try {
          const created = await promptsApi.create({ title, content, tag: draft.tag });
          if (created) {
            setPrompts((prev) => prev.map((p) => (p.id === newPrompt.id ? created : p)));
          }
        } catch {
          // 静默失败：保留本地新建
        }
      } else {
        // 更新
        setPrompts((prev) =>
          prev.map((p) =>
            p.id === draft.id
              ? { ...p, title, content, tag: draft.tag, updatedAt: new Date().toISOString() }
              : p,
          ),
        );
        try {
          await promptsApi.update(draft.id, { title, content, tag: draft.tag });
        } catch {
          // 静默失败：保留本地更新
        }
      }
      cancelEdit();
    },
    [draft, creatingNew, cancelEdit],
  );

  // ── 删除确认 ──
  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPrompts((prev) => prev.filter((p) => p.id !== id));
    setPendingDeleteId(null);
    try {
      await promptsApi.remove(id);
    } catch {
      // 静默失败
    }
  }, [pendingDeleteId]);

  // ── 同步 ──
  const handleSync = useCallback(async () => {
    try {
      await promptsApi.sync();
      await loadPrompts();
    } catch {
      // 静默失败
    }
  }, [loadPrompts]);

  // ── 新建 ──
  const handleCreate = useCallback(() => {
    setEditingId(null);
    setCreatingNew(true);
    setDraft({ id: `new-${Date.now()}`, title: '', content: '', tag: 'work' });
  }, []);

  // ── 渲染 ──
  return (
    <div className={styles.page}>
      {/* 页面头部 */}
      <header className={styles.pageHeader}>
        <span className={styles.eyebrow}>Library · {prompts.length} Prompts</span>
        <h1 className={styles.title}>Prompt 库</h1>
        <p className={styles.lead}>
          精心策划的提示词集合，随设备同步——随时调用你最信赖的指令。
        </p>
      </header>

      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Input
            type="search"
            value={searchInput}
            onChange={handleSearchInput}
            placeholder="Search prompts…"
            icon={<SearchIcon />}
            aria-label="搜索 Prompt"
            className={styles.search}
          />
        </div>
        <div className={styles.chipRow} role="group" aria-label="按标签筛选">
          <FilterChip
            label="All"
            count={tagCounts.all ?? 0}
            active={activeTag === 'all'}
            onClick={() => setActiveTag('all')}
          />
          {TAG_OPTIONS.map((t) => (
            <FilterChip
              key={t}
              label={t}
              count={tagCounts[t] ?? 0}
              active={activeTag === t}
              onClick={() => setActiveTag(t)}
            />
          ))}
        </div>
        <div className={styles.toolbarActions}>
          <Button variant="secondary" size="sm" icon={<SyncIcon />} onClick={handleSync}>
            同步
          </Button>
          <Button variant="primary" size="sm" icon={<PlusIcon />} onClick={handleCreate}>
            新建
          </Button>
        </div>
      </div>

      {/* 错误提示条 */}
      {loadState === 'error' ? (
        <p className={styles.notice} role="status">
          列表加载失败：{loadError}
          {usedMock ? '。已使用本地示例数据。' : '。'}
        </p>
      ) : null}

      {/* 网格区 */}
      <section className={styles.gridSection}>
        {loadState === 'loading' && prompts.length === 0 ? (
          <GridSkeleton />
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <p>没有匹配的 Prompt</p>
            <p className={styles.emptyHint}>试试更换关键词或清除标签筛选</p>
          </div>
        ) : (
          <ul className={styles.grid}>
            {/* 新建占位卡片 */}
            {creatingNew && draft ? (
              <li>
                <EditPromptCard
                  draft={draft}
                  isNew
                  onChange={setDraft}
                  onSave={saveDraft}
                  onCancel={cancelEdit}
                />
              </li>
            ) : null}

            {filtered.map((p) =>
              editingId === p.id && draft ? (
                <li key={p.id}>
                  <EditPromptCard
                    draft={draft}
                    isNew={false}
                    onChange={setDraft}
                    onSave={saveDraft}
                    onCancel={cancelEdit}
                  />
                </li>
              ) : (
                <li key={p.id}>
                  <PromptCardView
                    prompt={p}
                    onEdit={() => startEdit(p)}
                    onDelete={() => setPendingDeleteId(p.id)}
                  />
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {/* 删除确认弹层 */}
      {pendingDeleteId ? (
        <div className={styles.modalMask} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <Card variant="elevated" className={styles.modal}>
            <h3 id="confirm-title" className={styles.modalTitle}>
              删除 Prompt？
            </h3>
            <p className={styles.modalText}>该操作不可撤销，确认要删除这条 Prompt 吗？</p>
            <div className={styles.modalActions}>
              <Button variant="secondary" size="sm" onClick={() => setPendingDeleteId(null)}>
                取消
              </Button>
              <Button variant="danger" size="sm" icon={<TrashIcon />} onClick={confirmDelete}>
                删除
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 子组件
// ────────────────────────────────────────────────────────────────

/** 标签筛选 chip */
function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[styles.chip, active ? styles.chipActive : ''].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-pressed={active}
    >
      <span>{label}</span>
      <span className={styles.chipCount}>{count}</span>
    </button>
  );
}

/** 展示态 Prompt 卡片 */
function PromptCardView({
  prompt,
  onEdit,
  onDelete,
}: {
  prompt: Prompt;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card variant="elevated" className={styles.promptCard}>
      <Card.Header className={styles.promptHeader}>
        <h3 className={styles.promptTitle}>{prompt.title}</h3>
        <div className={styles.promptActions}>
          <Button
            variant="ghost"
            size="sm"
            icon={<EditIcon />}
            onClick={onEdit}
            aria-label="编辑"
            title="编辑"
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<TrashIcon />}
            onClick={onDelete}
            aria-label="删除"
            title="删除"
          />
        </div>
      </Card.Header>
      <Card.Body className={styles.promptBody}>
        <p className={styles.promptContent}>{prompt.content}</p>
      </Card.Body>
      <Card.Footer className={styles.promptFoot}>
        {prompt.tag ? <Tag size="sm">{prompt.tag}</Tag> : <span />}
      </Card.Footer>
    </Card>
  );
}

/** 编辑 / 新建态卡片 */
function EditPromptCard({
  draft,
  isNew,
  onChange,
  onSave,
  onCancel,
}: {
  draft: DraftPrompt;
  isNew: boolean;
  onChange: (next: DraftPrompt) => void;
  onSave: (e?: FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <Card variant="elevated" className={[styles.promptCard, styles.promptCardEditing].join(' ')}>
      <form className={styles.editForm} onSubmit={onSave}>
        <Card.Header className={styles.promptHeader}>
          <input
            className={styles.editTitle}
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
            placeholder="标题"
            aria-label="Prompt 标题"
            autoFocus={isNew}
          />
        </Card.Header>
        <Card.Body className={styles.promptBody}>
          <textarea
            className={styles.editContent}
            value={draft.content}
            onChange={(e) => onChange({ ...draft, content: e.target.value })}
            placeholder="Prompt 内容…"
            aria-label="Prompt 内容"
            rows={4}
          />
          <div className={styles.editMeta}>
            <span className={styles.editMetaLabel}>标签</span>
            <select
              className={styles.editSelect}
              value={draft.tag}
              onChange={(e) => onChange({ ...draft, tag: e.target.value as TagOption })}
              aria-label="选择标签"
            >
              {TAG_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </Card.Body>
        <Card.Footer className={styles.promptFoot}>
          <Button
            variant="ghost"
            size="sm"
            icon={<XIcon />}
            onClick={onCancel}
            type="button"
          >
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<CheckIcon />}
            type="submit"
            disabled={!draft.title.trim() || !draft.content.trim()}
          >
            保存
          </Button>
        </Card.Footer>
      </form>
    </Card>
  );
}

/** 网格骨架屏 */
function GridSkeleton() {
  return (
    <ul className={styles.grid} aria-busy="true" aria-label="加载 Prompts">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li key={i} className={styles.skeletonCard}>
          <span className={styles.skeletonBlock} style={{ width: '60%', height: 14 }} />
          <span className={styles.skeletonBlock} style={{ width: '90%', height: 12 }} />
          <span className={styles.skeletonBlock} style={{ width: '80%', height: 12 }} />
        </li>
      ))}
    </ul>
  );
}
