/**
 * WorkbenchSqlitePreview 业务组件
 *
 * Business Logic（为什么需要这个组件）:
 *   Workbench 文件查看器需要浏览 SQLite 数据库的用户表和当前表样例数据，但预览阶段必须保持只读。
 *
 * Code Logic（这个组件做什么）:
 *   接收 SQLite 预览 DTO，左侧渲染表名列表，右侧渲染当前表的列与行；表切换通过 onSelectTable 回调交给容器处理。
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkbenchSqlitePreview as WorkbenchSqlitePreviewDto } from '@/lib/types';
import styles from './WorkbenchSqlitePreview.module.css';

export interface WorkbenchSqlitePreviewProps {
  preview: WorkbenchSqlitePreviewDto;
  onSelectTable: (table: string) => void;
}

/**
 * 渲染 Workbench SQLite 只读表和数据预览
 *
 * Business Logic（为什么需要这个组件）:
 *   用户查看 SQLite 文件时需要在多个表之间切换，并快速扫描当前表数据，同时避免任何写入入口。
 *
 * Code Logic（这个组件做什么）:
 *   用 preview.tables 生成可点击表列表，selectedTable 标记当前表；右侧复用只读表格结构展示 columns/rows，
 *   并在空表列表、空数据行和截断状态下渲染本地化提示。
 */
export function WorkbenchSqlitePreview(props: WorkbenchSqlitePreviewProps): ReactElement {
  const { preview, onSelectTable } = props;
  const { t } = useTranslation(['workbench']);
  const hasTables = preview.tables.length > 0;
  const hasRows = preview.rows.length > 0;

  return (
    <section className={styles.shell}>
      <aside className={styles.tableList}>
        {hasTables ? (
          preview.tables.map((table) => (
            <button
              key={table}
              type="button"
              className={styles.tableButton}
              data-active={table === preview.selectedTable}
              aria-pressed={table === preview.selectedTable}
              onClick={() => onSelectTable(table)}
            >
              {table}
            </button>
          ))
        ) : (
          <div className={styles.emptyTables}>{t('workbench:filePreviews.emptyTables')}</div>
        )}
      </aside>

      <div className={styles.previewPane}>
        {preview.truncated ? (
          <div className={styles.notice}>{t('workbench:filePreviews.truncated')}</div>
        ) : null}

        {!hasTables ? (
          <div className={styles.emptyState}>{t('workbench:filePreviews.emptyTables')}</div>
        ) : !hasRows ? (
          <div className={styles.emptyState}>{t('workbench:filePreviews.emptyRows')}</div>
        ) : (
          <div className={styles.tableScroller}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {preview.columns.map((column, columnIndex) => (
                    <th key={`${column}-${columnIndex}`} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {preview.columns.map((column, columnIndex) => (
                      <td key={`${column}-${columnIndex}`}>{row[columnIndex] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
