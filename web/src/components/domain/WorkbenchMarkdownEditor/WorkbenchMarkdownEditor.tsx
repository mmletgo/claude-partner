/**
 * WorkbenchMarkdownEditor 业务组件
 *
 * Business Logic（为什么需要这个组件）:
 *   工作台文件查看器需要对 Markdown 文件提供接近 Typora 的可视化编辑体验，同时保留源码编辑和分屏校对能力，
 *   让用户在同一个文件内容上按当前任务切换阅读、排版和精确 Markdown 源码修改。
 *
 * Code Logic（这个组件做什么）:
 *   - 使用 Tiptap StarterKit + Markdown extension 渲染 WYSIWYG 编辑区，并用 WorkbenchCodeEditor 复用源码编辑能力
 *   - 维护一份本地 Markdown 字符串，在 WYSIWYG/source/split 三种模式之间同步内容并向上层派发 onChange
 *   - 捕获 Markdown 序列化或解析失败，保留当前编辑内容并展示本地化同步错误提示
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
  onModeChange: (mode: WorkbenchMarkdownMode) => void;
  onChange: (value: string) => void;
}

const MARKDOWN_EDITOR_EXTENSIONS = [StarterKit, Markdown];

/**
 * 渲染工作台 Markdown 编辑器
 *
 * Business Logic（为什么需要这个组件）:
 *   Markdown 文件既需要即时排版编辑，也需要用户能回到源文本修正语法；工作台文件编辑器通过该组件统一承载
 *   三种编辑模式，避免页面层重复维护 WYSIWYG 与源码之间的同步逻辑。
 *
 * Code Logic（这个组件做什么）:
 *   初始化 Tiptap Markdown 编辑器和本地 sourceValue 状态；WYSIWYG 更新时用 editor.getMarkdown() 序列化，
 *   源码更新和外部 value 更新时用 editor.commands.setContent(..., { contentType: 'markdown', emitUpdate: false })
 *   回写 Tiptap，并通过 syncError 状态展示同步失败提示。
 */
export function WorkbenchMarkdownEditor({
  value,
  mode,
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
    immediatelyRender: false,
    onUpdate: handleEditorUpdate,
  });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setSourceValue(value);

    if (!editor) {
      return;
    }

    try {
      if (editor.getMarkdown() !== value) {
        editor.commands.setContent(value, {
          contentType: 'markdown',
          emitUpdate: false,
        });
      }
      setSyncError(false);
    } catch {
      setSyncError(true);
    }
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
      setSourceValue(next);
      setSyncError(false);
      onChangeRef.current(next);

      if (!editor) {
        return;
      }

      try {
        editor.commands.setContent(next, {
          contentType: 'markdown',
          emitUpdate: false,
        });
      } catch {
        setSyncError(true);
      }
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
                onChange={handleSourceChange}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
