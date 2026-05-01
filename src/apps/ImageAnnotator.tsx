/**
 * Image annotator — opens an image in editing mode with a toolbar of
 * vector-style annotation tools (rectangle / circle / arrow / text), a
 * mosaic blur for redacting information, and crop. Undo and download
 * supported.
 *
 * Architecture:
 *   - Main canvas (`canvasRef`) holds the committed image + annotations.
 *     Each tool's commit step draws onto this canvas.
 *   - Overlay canvas (`overlayRef`) sits on top and shows the
 *     drawing-in-progress preview (live shape that follows the pointer).
 *     Cleared on every move so previews don't accumulate.
 *   - History: snapshots of the main canvas pushed before each commit;
 *     undo restores the most recent snapshot.
 *   - Crop: stays as an in-progress overlay until the user clicks
 *     "Apply Crop", which resizes the main canvas to the selection.
 *
 * Save: `canvas.toBlob` → triggered download with the original filename
 * suffixed `-annotated.png`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from '../shell/toast';

type Tool = 'rect' | 'circle' | 'arrow' | 'mosaic' | 'text' | 'crop';

interface ImageAnnotatorProps {
  src: string;
  filename: string;
  onClose: () => void;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#000000', '#ffffff'];
const STROKE_DEFAULT = 4;
const MOSAIC_BLOCK = 12;

export default function ImageAnnotator({ src, filename, onClose }: ImageAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<Tool>('rect');
  const [color, setColor] = useState(COLORS[0]);
  const [stroke, setStroke] = useState(STROKE_DEFAULT);
  // History stack of canvas snapshots — each entry is the bitmap right BEFORE
  // the action that produced the current state.
  const historyRef = useRef<ImageData[]>([]);
  const [historyDepth, setHistoryDepth] = useState(0);
  const [imageReady, setImageReady] = useState(false);
  // Pending text input (placed where the user clicked).
  const [pendingText, setPendingText] = useState<{ x: number; y: number; value: string } | null>(null);
  // Pending crop region (image coords). Two phases: dragging (live), applied (waiting for confirm).
  const [pendingCrop, setPendingCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Display scale — natural canvas pixels divided by displayed CSS pixels —
  // used to translate pointer coords into canvas coords when the canvas is
  // letterboxed inside its container.
  const [displayScale, setDisplayScale] = useState(1);

  // Load source image into the main canvas at its natural dimensions.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = canvasRef.current;
      const o = overlayRef.current;
      if (!c || !o) return;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      o.width = img.naturalWidth;
      o.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      historyRef.current = [];
      setHistoryDepth(0);
      setImageReady(true);
    };
    img.onerror = () => toast.error('Failed to load image');
    img.src = src;
  }, [src]);

  // Track displayed CSS dimensions so pointer coords can be converted to
  // canvas (image-pixel) coords. Re-measure on container resize.
  useEffect(() => {
    if (!imageReady) return;
    const update = () => {
      const c = canvasRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      if (rect.width > 0) setDisplayScale(c.width / rect.width);
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [imageReady]);

  // ── helpers ────────────────────────────────────────────────────────────────
  const pushHistory = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    historyRef.current.push(ctx.getImageData(0, 0, c.width, c.height));
    if (historyRef.current.length > 50) historyRef.current.shift();
    setHistoryDepth(historyRef.current.length);
  };

  const undo = () => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current.pop()!;
    setHistoryDepth(historyRef.current.length);
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d')!.putImageData(prev, 0, 0);
    // Cancel any in-flight crop too.
    setPendingCrop(null);
    clearOverlay();
  };

  const clearOverlay = () => {
    const o = overlayRef.current;
    if (!o) return;
    o.getContext('2d')!.clearRect(0, 0, o.width, o.height);
  };

  // Map pointer event → canvas coordinates.
  const evToCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) * displayScale;
    const y = (e.clientY - rect.top) * displayScale;
    return { x, y };
  };

  // ── drawing ────────────────────────────────────────────────────────────────
  const dragRef = useRef<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);

  const drawShapePreview = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const o = overlayRef.current;
    if (!o) return;
    const ctx = o.getContext('2d')!;
    ctx.clearRect(0, 0, o.width, o.height);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = stroke;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'rect') {
      drawRoundedRect(ctx, start, end, stroke);
    } else if (tool === 'circle') {
      drawEllipse(ctx, start, end);
    } else if (tool === 'arrow') {
      drawArrow(ctx, start, end, stroke);
    } else if (tool === 'mosaic') {
      // Show a translucent rectangle preview while dragging.
      ctx.fillStyle = `${color}33`;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      const r = normalizeRect(start, end);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    } else if (tool === 'crop') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      const r = normalizeRect(start, end);
      // Dim outside region.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, o.width, r.y);
      ctx.fillRect(0, r.y + r.h, o.width, o.height - (r.y + r.h));
      ctx.fillRect(0, r.y, r.x, r.h);
      ctx.fillRect(r.x + r.w, r.y, o.width - (r.x + r.w), r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([]);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!imageReady) return;
    const pos = evToCanvas(e);

    if (tool === 'text') {
      // One click drops a text input here; commit happens when the user
      // confirms the input.
      setPendingText({ x: pos.x, y: pos.y, value: '' });
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { start: pos, current: pos };
    drawShapePreview(pos, pos);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const pos = evToCanvas(e);
    dragRef.current.current = pos;
    drawShapePreview(dragRef.current.start, pos);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const { start, current } = dragRef.current;
    dragRef.current = null;

    // Empty drag (no movement) → cancel.
    if (Math.abs(current.x - start.x) < 2 && Math.abs(current.y - start.y) < 2) {
      clearOverlay();
      return;
    }

    if (tool === 'crop') {
      // Crop stays as a pending overlay until "Apply Crop" is pressed.
      const r = normalizeRect(start, current);
      setPendingCrop(r);
      return;
    }

    pushHistory();
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = stroke;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'rect') drawRoundedRect(ctx, start, current, stroke);
    else if (tool === 'circle') drawEllipse(ctx, start, current);
    else if (tool === 'arrow') drawArrow(ctx, start, current, stroke);
    else if (tool === 'mosaic') applyMosaic(ctx, normalizeRect(start, current));

    clearOverlay();
  };

  const commitText = () => {
    if (!pendingText) return;
    if (!pendingText.value.trim()) {
      setPendingText(null);
      return;
    }
    pushHistory();
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    const fontSize = Math.max(16, stroke * 6);
    ctx.fillStyle = color;
    ctx.font = `600 ${fontSize}px -apple-system, system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    // Multi-line support: split on newlines.
    const lines = pendingText.value.split('\n');
    lines.forEach((line, i) => {
      ctx.fillText(line, pendingText.x, pendingText.y + i * fontSize * 1.2);
    });
    setPendingText(null);
  };

  const applyCrop = () => {
    if (!pendingCrop) return;
    const c = canvasRef.current!;
    pushHistory();
    const r = pendingCrop;
    const data = c.getContext('2d')!.getImageData(r.x, r.y, r.w, r.h);
    c.width = Math.round(r.w);
    c.height = Math.round(r.h);
    overlayRef.current!.width = c.width;
    overlayRef.current!.height = c.height;
    c.getContext('2d')!.putImageData(data, 0, 0);
    setPendingCrop(null);
    clearOverlay();
    // Re-measure displayScale because the canvas dimensions changed.
    requestAnimationFrame(() => {
      const rect = c.getBoundingClientRect();
      if (rect.width > 0) setDisplayScale(c.width / rect.width);
    });
  };

  const cancelCrop = () => {
    setPendingCrop(null);
    clearOverlay();
  };

  const downloadAnnotated = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob(blob => {
      if (!blob) { toast.error('Failed to export'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const base = filename.replace(/\.[^.]+$/, '');
      a.download = `${base}-annotated.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const tools: { id: Tool; label: string; icon: JSX.Element }[] = useMemo(() => [
    { id: 'rect',   label: 'Rectangle', icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="4" y="6" width="16" height="12" rx="3" /></svg> },
    { id: 'circle', label: 'Ellipse',   icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><ellipse cx="12" cy="12" rx="8" ry="6" /></svg> },
    { id: 'arrow',  label: 'Arrow',     icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 19L19 5m0 0h-7m7 0v7" /></svg> },
    { id: 'mosaic', label: 'Mosaic',    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></svg> },
    { id: 'text',   label: 'Text',      icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M12 6v14M9 20h6" /></svg> },
    { id: 'crop',   label: 'Crop',      icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 2v15a1 1 0 001 1h15M2 6h15a1 1 0 011 1v15" /></svg> },
  ], []);

  const btnClass = (active: boolean) =>
    `p-1.5 rounded transition-colors ${active ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-200'}`;

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Tool bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white shrink-0 flex-wrap">
        {tools.map(t => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={t.label}
            className={btnClass(tool === t.id)}
          >
            {t.icon}
          </button>
        ))}

        <div className="h-5 w-px bg-gray-300 mx-1" />

        {/* Color picker */}
        <div className="flex items-center gap-1">
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              className={`h-5 w-5 rounded-full border ${color === c ? 'ring-2 ring-blue-500 ring-offset-1' : 'border-gray-300'}`}
              style={{ background: c }}
            />
          ))}
        </div>

        <div className="h-5 w-px bg-gray-300 mx-1" />

        {/* Stroke width */}
        <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <span>Size</span>
          <input
            type="range"
            min={2}
            max={12}
            step={1}
            value={stroke}
            onChange={(e) => setStroke(Number(e.target.value))}
            className="w-16 accent-blue-500"
          />
          <span className="tabular-nums w-4 text-right">{stroke}</span>
        </label>

        <div className="h-5 w-px bg-gray-300 mx-1" />

        <button onClick={undo} disabled={historyDepth === 0} className="px-2 py-1 text-xs rounded hover:bg-gray-200 disabled:opacity-30 text-gray-700">Undo</button>
        <button onClick={downloadAnnotated} className="px-2 py-1 text-xs rounded hover:bg-gray-200 text-gray-700">Save</button>

        <div className="ml-auto flex items-center gap-2">
          {pendingCrop && (
            <>
              <button onClick={applyCrop} className="px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600">Apply Crop</button>
              <button onClick={cancelCrop} className="px-2 py-1 text-xs rounded hover:bg-gray-200 text-gray-700">Cancel</button>
            </>
          )}
          <button onClick={onClose} className="px-2 py-1 text-xs rounded hover:bg-gray-200 text-gray-700">Exit</button>
        </div>
      </div>

      {/* Canvas area */}
      <div ref={wrapRef} className="flex-1 overflow-auto bg-gray-200 flex items-center justify-center p-4 relative">
        <div className="relative inline-block max-w-full max-h-full">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { dragRef.current = null; clearOverlay(); }}
            style={{ touchAction: 'none', maxWidth: '100%', maxHeight: '100%', display: 'block', cursor: tool === 'text' ? 'text' : 'crosshair' }}
            className="shadow-lg rounded bg-white"
          />
          <canvas
            ref={overlayRef}
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              maxWidth: '100%', maxHeight: '100%',
              width: '100%', height: '100%',
            }}
          />
          {pendingText && (
            <div
              style={{
                position: 'absolute',
                left: `${pendingText.x / displayScale}px`,
                top: `${pendingText.y / displayScale}px`,
                transform: 'translateY(-2px)',
              }}
              className="z-10"
            >
              <textarea
                autoFocus
                value={pendingText.value}
                onChange={(e) => setPendingText({ ...pendingText, value: e.target.value })}
                onBlur={commitText}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setPendingText(null); }
                  else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
                }}
                placeholder="Type then Enter…"
                rows={1}
                className="bg-white/95 border border-blue-400 rounded px-1 py-0.5 text-sm outline-none resize-none shadow-md"
                style={{ color, fontWeight: 600, minWidth: 80 }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── shape helpers ────────────────────────────────────────────────────────────

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
  stroke: number,
) {
  const r = normalizeRect(start, end);
  const radius = Math.min(r.w, r.h, 16) * 0.4;
  ctx.beginPath();
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(r.x, r.y, r.w, r.h, radius);
  } else {
    // Fallback for browsers that don't have roundRect (most modern do).
    ctx.moveTo(r.x + radius, r.y);
    ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, radius);
    ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, radius);
    ctx.arcTo(r.x, r.y + r.h, r.x, r.y, radius);
    ctx.arcTo(r.x, r.y, r.x + r.w, r.y, radius);
    ctx.closePath();
  }
  ctx.lineWidth = stroke;
  ctx.stroke();
}

function drawEllipse(
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const r = normalizeRect(start, end);
  ctx.beginPath();
  ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
  stroke: number,
) {
  // Shaft
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  // Head
  const headLen = Math.max(12, stroke * 4);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const a1 = angle + Math.PI - Math.PI / 7;
  const a2 = angle + Math.PI + Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x + headLen * Math.cos(a1), end.y + headLen * Math.sin(a1));
  ctx.lineTo(end.x + headLen * Math.cos(a2), end.y + headLen * Math.sin(a2));
  ctx.closePath();
  ctx.fill();
}

function applyMosaic(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
) {
  const x = Math.round(Math.max(0, rect.x));
  const y = Math.round(Math.max(0, rect.y));
  const w = Math.round(Math.min(ctx.canvas.width - x, rect.w));
  const h = Math.round(Math.min(ctx.canvas.height - y, rect.h));
  if (w < 2 || h < 2) return;
  const data = ctx.getImageData(x, y, w, h);
  const block = MOSAIC_BLOCK;
  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      // Average color of this block
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const blockW = Math.min(block, w - bx);
      const blockH = Math.min(block, h - by);
      for (let yy = 0; yy < blockH; yy++) {
        for (let xx = 0; xx < blockW; xx++) {
          const i = ((by + yy) * w + (bx + xx)) * 4;
          r += data.data[i];
          g += data.data[i + 1];
          b += data.data[i + 2];
          a += data.data[i + 3];
          n++;
        }
      }
      r = Math.round(r / n);
      g = Math.round(g / n);
      b = Math.round(b / n);
      a = Math.round(a / n);
      // Paint the block solid with that average
      for (let yy = 0; yy < blockH; yy++) {
        for (let xx = 0; xx < blockW; xx++) {
          const i = ((by + yy) * w + (bx + xx)) * 4;
          data.data[i] = r;
          data.data[i + 1] = g;
          data.data[i + 2] = b;
          data.data[i + 3] = a;
        }
      }
    }
  }
  ctx.putImageData(data, x, y);
}
