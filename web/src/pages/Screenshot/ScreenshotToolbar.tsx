/**
 * ScreenshotToolbar - 截图编辑工具条
 *
 * Business Logic: 用户框选后进入编辑模式，用工具条选标注工具（矩形/箭头）+ 颜色，撤销最后一个标注，
 *   确认合成写剪贴板或取消。布局微信截图风格。
 *
 * Code Logic: 受控组件——当前工具/颜色由父组件管理，本组件只负责展示 + 回调。
 */

import styles from './ScreenshotToolbar.module.css';

export type ToolKind = 'rect' | 'arrow';

/** 预设 6 色板（红/黄/绿/蓝/白/黑），固定线宽由 canvas 绘制层控制 */
// COLORS 与 COLOR_NAMES 索引对齐，供颜色按钮 title 显示中文名。允许从组件文件导出常量（与 Toolbar 内聚），抑制 react-refresh only-export-components。
// eslint-disable-next-line react-refresh/only-export-components
export const COLORS = ['#FF3B30', '#FFCC00', '#34C759', '#007AFF', '#FFFFFF', '#000000'];
/** 颜色中文名（与 COLORS 同序），供按钮 title 显示 */
// eslint-disable-next-line react-refresh/only-export-components
export const COLOR_NAMES = ['红', '黄', '绿', '蓝', '白', '黑'];

interface ScreenshotToolbarProps {
  tool: ToolKind;
  onToolChange: (tool: ToolKind) => void;
  color: string;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ScreenshotToolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  onUndo,
  onConfirm,
  onCancel,
}: ScreenshotToolbarProps) {
  return (
    <div className={styles.toolbar} role="toolbar">
      <button
        type="button"
        className={tool === 'rect' ? styles.toolBtnActive : styles.toolBtn}
        onClick={() => onToolChange('rect')}
        title="矩形"
      >
        ▭
      </button>
      <button
        type="button"
        className={tool === 'arrow' ? styles.toolBtnActive : styles.toolBtn}
        onClick={() => onToolChange('arrow')}
        title="箭头"
      >
        →
      </button>
      <span className={styles.divider} />
      <div className={styles.colors}>
        {COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            className={color === c ? styles.colorBtnActive : styles.colorBtn}
            style={{ backgroundColor: c }}
            onClick={() => onColorChange(c)}
            title={COLOR_NAMES[i]}
          />
        ))}
      </div>
      <span className={styles.divider} />
      <button type="button" className={styles.toolBtn} onClick={onUndo} title="撤销">
        ↶
      </button>
      <button type="button" className={styles.confirmBtn} onClick={onConfirm} title="确认">
        ✓
      </button>
      <button type="button" className={styles.cancelBtn} onClick={onCancel} title="取消">
        ✕
      </button>
    </div>
  );
}
