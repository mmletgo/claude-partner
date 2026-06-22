/**
 * Overlay - 区域截图选区页（独立于主 AppShell）
 *
 * Business Logic（为什么需要这个组件）:
 *   用户在屏幕上框选区域截图，松手后裁剪写剪贴板，可直接粘贴到 Claude Code。
 *   采用微信截图风格：进入即整屏盖半透明黑色遮罩（每屏 overlay 各盖一层），框选时选区外保持暗、
 *   选区内挖洞清晰。选区窗口真透明（不用桌面截图作背景）。ESC/右键/点空白取消。
 *
 *   裁剪关键：mouseup 后先隐藏遮罩与选区边框（hiding=true 让 overlay 全透明），等浏览器渲染到屏幕，
 *   再 invoke crop_and_copy——否则 Rust 端重新抓屏会把蓝色边框/遮罩裁进最终截图。
 *
 * Code Logic（这个组件做什么）:
 *   - onMount：强制 html/body 背景透明，覆盖全局 reset.css 的 `body { background: var(--bg) }`
 *     （主题底色，浅色=#f5f4ed）。transparent 窗口需 html/body 全链路透明，否则会显示主题底色
 *     而非透出桌面（=白屏）；onUnmount 恢复原值。
 *   - mousedown 记起点（同步 selectionRef），mousemove 实时更新选区矩形（四块遮罩挖洞 + 蓝色虚线边框）。
 *   - mouseup 有效选区（宽高≥10）：先 hiding=true（隐藏遮罩/边框，overlay 全透明）→ 双 rAF 等渲染
 *     → invoke('crop_and_copy') 让 Rust 抓到纯桌面再裁剪；选区过小则 cancel。
 *   - ESC/右键 → invoke('cancel_region_capture')。
 *   - 坐标用逻辑像素（CSS px），dpr 一起传给 Rust，Rust ×dpr 换算物理像素裁剪（xcap 帧即物理像素）。
 *   - React hooks 必须在所有 early return 之前（项目规则 20）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@/api/client';
import styles from './Overlay.module.css';

/** 选区矩形（逻辑像素，相对当前窗口左上角） */
interface Selection {
  startX: number;
  startY: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** URL query 中解析 display index；缺省 0（主屏） */
function parseDisplay(): number {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('display');
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function Overlay() {
  // hooks 必须在任何 early return 之前调用（项目规则 20）
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hiding, setHiding] = useState(false);
  const displayRef = useRef<number>(parseDisplay());
  const draggingRef = useRef<boolean>(false);
  const selectionRef = useRef<Selection | null>(null); // 最新选区，供 mouseup 读取（避免 updater 副作用）

  // 强制页面背景透明：transparent 窗口需 html/body 全链路透明，否则全局 reset.css 的
  // body { background: var(--bg) }（主题底色，浅色=#f5f4ed）会让窗口显示为白屏而非透出桌面。
  // onUnmount 恢复原值（窗口随截图结束销毁，恢复仅为卫生）。
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.background;
    const prevBody = body.style.background;
    html.style.background = 'transparent';
    body.style.background = 'transparent';
    return () => {
      html.style.background = prevHtml;
      body.style.background = prevBody;
    };
  }, []);

  // 取消：ESC 触发
  const cancel = useCallback(async () => {
    try {
      await invoke('cancel_region_capture');
    } catch {
      // ignore
    }
  }, []);

  // ESC 键监听
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel]);

  // 鼠标按下：记录起点（同步 selectionRef）
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // 仅左键开始选区
    draggingRef.current = true;
    const sel: Selection = {
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      w: 0,
      h: 0,
    };
    selectionRef.current = sel;
    setSelection(sel);
  }, []);

  // 鼠标移动：实时更新选区（同步 selectionRef）
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setSelection((prev) => {
      if (!prev) return prev;
      const next: Selection = {
        ...prev,
        x: Math.min(prev.startX, e.clientX),
        y: Math.min(prev.startY, e.clientY),
        w: Math.abs(e.clientX - prev.startX),
        h: Math.abs(e.clientY - prev.startY),
      };
      selectionRef.current = next;
      return next;
    });
  }, []);

  // 鼠标抬起：有效选区则先隐藏遮罩/边框再裁剪，避免把蓝色边框/遮罩抓进最终截图
  const onMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !draggingRef.current) return;
      draggingRef.current = false;
      const sel = selectionRef.current;
      if (sel && sel.w >= 10 && sel.h >= 10) {
        // hiding=true 让 overlay 全透明（无遮罩无边框），双 rAF 确保渲染到屏幕后再抓屏
        setHiding(true);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            void invoke('crop_and_copy', {
              display: displayRef.current,
              x: Math.round(sel.x),
              y: Math.round(sel.y),
              w: Math.round(sel.w),
              h: Math.round(sel.h),
              dpr: window.devicePixelRatio,
            }).catch(() => {
              // 裁剪失败：恢复遮罩，让用户可重试或 ESC 取消
              setHiding(false);
            });
          }),
        );
      } else {
        // 选区过小视为取消（对照 Python mouseRelease 无效选区 → cancelled）
        void cancel();
      }
    },
    [cancel],
  );

  // 右键取消
  const onContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      void cancel();
    },
    [cancel],
  );

  return (
    <div
      className={styles.overlay}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onContextMenu={onContextMenu}
    >
      {/* hiding=true 时不渲染任何遮罩/边框，让窗口全透明，Rust 抓到纯桌面（避免边框入图） */}
      {!hiding &&
        (selection && selection.w > 0 && selection.h > 0 ? (
          <>
            {/* 框选中：四块半透明遮罩盖选区外（挖洞）+ 蓝色虚线选区边框 */}
            <div
              className={styles.mask}
              style={{ left: 0, top: 0, right: 0, bottom: `calc(100% - ${selection.y}px)` }}
            />
            <div
              className={styles.mask}
              style={{ left: 0, top: `${selection.y + selection.h}px`, right: 0, bottom: 0 }}
            />
            <div
              className={styles.mask}
              style={{ left: 0, top: `${selection.y}px`, width: `${selection.x}px`, height: `${selection.h}px` }}
            />
            <div
              className={styles.mask}
              style={{
                left: `${selection.x + selection.w}px`,
                top: `${selection.y}px`,
                right: 0,
                height: `${selection.h}px`,
              }}
            />
            {/* 高亮矩形边框 */}
            <div
              className={styles.selection}
              style={{
                left: `${selection.x}px`,
                top: `${selection.y}px`,
                width: `${selection.w}px`,
                height: `${selection.h}px`,
              }}
            />
          </>
        ) : (
          <>
            {/* 未框选：整屏半透明黑色遮罩（微信截图风格，进入即全屏变暗） */}
            <div className={styles.mask} style={{ inset: 0 }} />
          </>
        ))}
    </div>
  );
}
