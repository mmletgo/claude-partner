/**
 * WorkbenchCsvPreview 业务组件
 *
 * Business Logic（为什么需要这个组件）:
 *   Workbench 文件查看器需要以表格形式查看 CSV/TSV 内容，但当前预览阶段不能修改源文件。
 *
 * Code Logic（这个组件做什么）:
 *   接收 CSV 预览 DTO，渲染只读表头和行数据；空列/空行与截断状态使用 workbench i18n 文案提示。
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkbenchCsvPreview as WorkbenchCsvPreviewDto } from '@/lib/types';
import styles from './WorkbenchCsvPreview.module.css';

export interface WorkbenchCsvPreviewProps {
  preview: WorkbenchCsvPreviewDto;
}

/**
 * 渲染 Workbench CSV 只读表格预览
 *
 * Business Logic（为什么需要这个组件）:
 *   用户打开表格文本文件时需要快速扫描列名和样例行，并知道后端是否只返回了部分内容。
 *
 * Code Logic（这个组件做什么）:
 *   使用 columns 生成 sticky 表头，rows 生成只读单元格；有列无行时保留表头并在 tbody 展示空行提示。
 */
export function WorkbenchCsvPreview(props: WorkbenchCsvPreviewProps): ReactElement {
  const { preview } = props;
  const { t } = useTranslation(['workbench']);
  const hasColumns = preview.columns.length > 0;
  const hasRows = preview.rows.length > 0;

  return (
    <section className={styles.shell}>
      {preview.truncated ? (
        <div className={styles.notice}>{t('workbench:filePreviews.truncated')}</div>
      ) : null}

      {!hasColumns ? (
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
              {hasRows ? (
                preview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {preview.columns.map((column, columnIndex) => (
                      <td key={`${column}-${columnIndex}`}>{row[columnIndex] ?? ''}</td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td className={styles.emptyRowCell} colSpan={preview.columns.length}>
                    {t('workbench:filePreviews.emptyRows')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
