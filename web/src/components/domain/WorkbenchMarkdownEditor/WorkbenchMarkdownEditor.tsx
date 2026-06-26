/**
 * WorkbenchMarkdownEditor 业务组件
 *
 * Business Logic（为什么需要这个组件）:
 *   工作台文件查看器需要对 Markdown 文件提供接近 Typora 的可视化编辑体验，同时保留源码编辑和分屏校对能力，
 *   让用户在同一个文件内容上按当前任务切换阅读、排版和精确 Markdown 源码修改；保存中需要临时只读以避免并发修改。
 *
 * Code Logic（这个组件做什么）:
 *   - 使用 Tiptap StarterKit + Markdown extension 渲染 WYSIWYG 编辑区，并用 WorkbenchCodeEditor 复用源码编辑能力
 *   - 维护一份本地 Markdown 字符串，只有 Tiptap 成功接受 Markdown 后才从源码侧提交内容
 *   - readOnly 为 true 时同步禁用 Tiptap 编辑能力和源码编辑器写入
 *   - 捕获 Markdown 序列化或解析失败，保留当前模式内容并展示本地化同步错误提示
 */

import type { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkbenchCodeEditor } from '../WorkbenchCodeEditor';
import styles from './WorkbenchMarkdownEditor.module.css';

export type WorkbenchMarkdownMode = 'wysiwyg' | 'source' | 'split';

export interface WorkbenchMarkdownEditorProps {
  value: string;
  mode: WorkbenchMarkdownMode;
  /** 只读态：保留浏览和模式切换，但禁止修改 Markdown 内容 */
  readOnly?: boolean;
  onModeChange: (mode: WorkbenchMarkdownMode) => void;
  onChange: (value: string) => void;
}

const MARKDOWN_EDITOR_EXTENSIONS = [StarterKit, Markdown];

/**
 * 尝试把 Markdown 写入 Tiptap 编辑器
 *
 * Business Logic（为什么需要这个函数）:
 *   Workbench Markdown 编辑器需要确保 WYSIWYG 文档和源码字符串始终来自同一次成功同步；
 *   如果 Tiptap 解析失败，不能提前把失败内容提交给父级，避免后续 WYSIWYG 更新覆盖源码。
 *
 * Code Logic（这个函数做什么）:
 *   调用 Tiptap setContent 写入 Markdown，并指定 contentType 与 emitUpdate:false；命令返回 false 或抛错都视为失败，
 *   调用方据此决定是否更新 sourceValue 和触发 onChange。
 */
function trySetEditorMarkdown(editor: Editor, markdown: string): boolean {
  try {
    return editor.commands.setContent(markdown, {
      contentType: 'markdown',
      emitUpdate: false,
    });
  } catch {
    return false;
  }
}

/**
 * 渲染工作台 Markdown 编辑器
 *
 * Business Logic（为什么需要这个组件）:
 *   Markdown 文件既需要即时排版编辑，也需要用户能回到源文本修正语法；工作台文件编辑器通过该组件统一承载
 *   三种编辑模式，并支持保存期间临时只读，避免页面层重复维护 WYSIWYG 与源码之间的同步逻辑。
 *
 * Code Logic（这个组件做什么）:
 *   初始化 Tiptap Markdown 编辑器和本地 sourceValue 状态；WYSIWYG 更新时用 editor.getMarkdown() 序列化，
 *   源码更新和外部 value 更新时先通过 trySetEditorMarkdown 确认 Tiptap 接受内容，成功后才更新 sourceValue/父级，
 *   readOnly 变化时同步 Tiptap editable 与源码编辑器 readOnly，并通过 syncError 状态展示同步失败提示。
 */
export function WorkbenchMarkdownEditor({
  value,
  mode,
  readOnly = false,
  onModeChange,
  onChange,
}: WorkbenchMarkdownEditorProps): ReactElement {
  const { t } = useTranslation(['workbench']);
  const onChangeRef = useRef(onChange);
  const [sourceValue, setSourceValue] = useState(value);
  const [syncError, setSyncError] = useState(false);

  const handleEditorUpdate = useCallback(({ editor: activeEditor }: { editor: Editor }) => {
    try {
      const markdown = activeEditor.getMarkdown();
      setSyncError(false);
      setSourceValue(markdown);
      onChangeRef.current(markdown);
    } catch {
      setSyncError(true);
    }
  }, []);

  const editor = useEditor({
    extensions: MARKDOWN_EDITOR_EXTENSIONS,
    content: value,
    contentType: 'markdown',
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: handleEditorUpdate,
  });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    let nextSourceValue: string | undefined;
    let nextSyncError = false;

    try {
      if (!editor) {
        nextSourceValue = value;
      } else {
        const currentMarkdown = editor.getMarkdown();

        if (currentMarkdown === value || trySetEditorMarkdown(editor, value)) {
          nextSourceValue = value;
        } else {
          nextSyncError = true;
        }
      }
    } catch {
      nextSyncError = true;
    }

    const syncTimer = window.setTimeout(() => {
      if (nextSourceValue !== undefined) {
        setSourceValue(nextSourceValue);
      }
      setSyncError(nextSyncError);
    }, 0);

    return () => window.clearTimeout(syncTimer);
  }, [editor, value]);

  const handleWysiwygMode = useCallback(() => {
    onModeChange('wysiwyg');
  }, [onModeChange]);

  const handleSourceMode = useCallback(() => {
    onModeChange('source');
  }, [onModeChange]);

  const handleSplitMode = useCallback(() => {
    onModeChange('split');
  }, [onModeChange]);

  const handleSourceChange = useCallback(
    (next: string) => {
      if (editor && !trySetEditorMarkdown(editor, next)) {
        setSyncError(true);
        return;
      }

      setSyncError(false);
      setSourceValue(next);
      onChangeRef.current(next);
    },
    [editor],
  );

  const showWysiwygPane = mode === 'wysiwyg' || mode === 'split';
  const showSourcePane = mode === 'source' || mode === 'split';

  return (
    <section className={styles.markdownShell}>
      <div
        className={styles.modeBar}
        role="group"
        aria-label={t('workbench:markdownEditor.modeBar')}
      >
        <button
          type="button"
          className={styles.modeButton}
          data-active={mode === 'wysiwyg'}
          aria-pressed={mode === 'wysiwyg'}
          onClick={handleWysiwygMode}
        >
          {t('workbench:markdownEditor.modes.wysiwyg')}
        </button>
        <button
          type="button"
          className={styles.modeButton}
          data-active={mode === 'source'}
          aria-pressed={mode === 'source'}
          onClick={handleSourceMode}
        >
          {t('workbench:markdownEditor.modes.source')}
        </button>
        <button
          type="button"
          className={styles.modeButton}
          data-active={mode === 'split'}
          aria-pressed={mode === 'split'}
          onClick={handleSplitMode}
        >
          {t('workbench:markdownEditor.modes.split')}
        </button>
      </div>

      <div className={styles.contentStack}>
        {syncError ? (
          <div className={styles.errorBanner} role="alert">
            {t('workbench:markdownEditor.syncError')}
          </div>
        ) : null}

        <div className={styles.markdownBody} data-mode={mode}>
          {showWysiwygPane ? (
            <div className={styles.wysiwygPane}>
              <EditorContent editor={editor} className={styles.editorContent} />
            </div>
          ) : null}

          {showSourcePane ? (
            <div className={styles.sourcePane}>
              <WorkbenchCodeEditor
                value={sourceValue}
                language="markdown"
                readOnly={readOnly}
                onChange={handleSourceChange}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
