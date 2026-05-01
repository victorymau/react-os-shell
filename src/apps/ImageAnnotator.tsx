/**
 * Image annotator — opens an image with vector-style annotations layered
 * over it. Each annotation is a real, editable object: select to drag,
 * Delete to remove, double-click text to edit. Zoom in/out scales the
 * editing surface; the underlying image-pixel coordinate system is
 * preserved so saved exports always render at full resolution.
 *
 * Architecture:
 *   - <canvas>  bottom layer: original image + any committed mosaic regions
 *               (mosaic edits real pixels, so it's baked into the canvas
 *               every render)
 *   - <svg>     top layer: shapes / arrows / text. Driven by the
 *               `annotations` state array; each item is interactive.
 *               viewBox is locked to image-pixel coords so coords are
 *               unaffected by the display zoom level.
 *
 * Tools:
 *   - select      (default) tap to select, drag to move, ⌫ to delete
 *   - rect        rounded rectangle
 *   - circle      ellipse
 *   - arrow       line + filled arrowhead
 *   - mosaic      averages dragged area into 12-px blocks (real pixels)
 *   - text        click drops an inline textarea; Enter commits
 *   - crop        drag a region; Apply / Cancel pills appear
 *
 * Save: rasterises the current canvas + the SVG (drawn at full image
 * resolution) into an off-screen canvas and downloads PNG.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from '../shell/toast';

type Tool = 'select' | 'rect' | 'circle' | 'arrow' | 'mosaic' | 'text' | 'crop';

interface ImageAnnotatorProps {
  src: string;
  filename: string;
  onClose: () => void;
}

type Annotation =
  | { id: string; type: 'rect';   x: number; y: number; w: number; h: number; color: string; stroke: number }
  | { id: string; type: 'circle'; x: number; y: number; w: number; h: number; color: string; stroke: number }
  | { id: string; type: 'arrow';  x1: number; y1: number; x2: number; y2: number; color: string; stroke: number }
  | { id: string; type: 'mosaic'; x: number; y: number; w: number; h: number }
  | { id: string; type: 'text';   x: number; y: number; text: string; color: string; size: number };

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#000000', '#ffffff'];
const STROKE_DEFAULT = 4;
const MOSAIC_BLOCK = 12;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

const newId = () => Math.random().toString(36).slice(2, 9);

export default function ImageAnnotator({ src, filename, onClose }: ImageAnnotatorProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState(COLORS[0]);
  const [stroke, setStroke] = useState(STROKE_DEFAULT);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [fitSize, setFitSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  // In-progress draw (preview): same shape types as Annotation but with no id.
  const [preview, setPreview] = useState<Annotation | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number; value: string; editingId?: string } | null>(null);
  const [pendingCrop, setPendingCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Drag state — used for both drawing and moving. `moveStart` is the
  // pointer's image-coord at down; `originalAnno` is a snapshot so move
  // deltas apply against the at-down state, not the running state.
  const dragRef = useRef<
    | { kind: 'draw'; start: { x: number; y: number } }
    | { kind: 'move'; id: string; start: { x: number; y: number }; original: Annotation }
    | { kind: 'crop'; start: { x: number; y: number } }
    | null
  >(null);

  const displaySize = useMemo(() => {
    if (!fitSize) return null;
    return { w: fitSize.w * zoom, h: fitSize.h * zoom };
  }, [fitSize, zoom]);

  // Load image.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
      setAnnotations([]);
      setSelectedId(null);
    };
    img.onerror = () => toast.error('Failed to load image');
    img.src = src;
  }, [src]);

  // Compute fit-to-area display size (independent of zoom).
  useEffect(() => {
    if (!imageSize) return;
    const update = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const availW = Math.max(0, r.width - 32); // p-4 padding
      const availH = Math.max(0, r.height - 32);
      if (availW === 0 || availH === 0) return;
      const ratio = imageSize.w / imageSize.h;
      let w = imageSize.w;
      let h = imageSize.h;
      if (w > availW) { w = availW; h = w / ratio; }
      if (h > availH) { h = availH; w = h * ratio; }
      setFitSize({ w, h });
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [imageSize]);

  // Render canvas: image + mosaic regions baked in. Re-runs whenever the
  // mosaic set changes or the source image changes.
  const mosaicAnnos = useMemo(
    () => annotations.filter(a => a.type === 'mosaic') as Extract<Annotation, { type: 'mosaic' }>[],
    [annotations],
  );
  useEffect(() => {
    const img = imageRef.current;
    const c = canvasRef.current;
    if (!img || !c || !imageSize) return;
    c.width = imageSize.w;
    c.height = imageSize.h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    for (const m of mosaicAnnos) applyMosaic(ctx, m);
  }, [imageSize, mosaicAnnos]);

  // Convert pointer event → image-pixel coords using SVG's CTM.
  const evToImage = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const t = pt.matrixTransform(ctm.inverse());
    return { x: t.x, y: t.y };
  };

  // ── selection / hit-testing ────────────────────────────────────────────────
  const handleAnnoPointerDown = (e: React.PointerEvent<SVGElement>, anno: Annotation) => {
    if (tool !== 'select') return; // Other tools handle their own drawing
    e.stopPropagation();
    setSelectedId(anno.id);
    const start = evToImage(e);
    dragRef.current = { kind: 'move', id: anno.id, start, original: anno };
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Click on whitespace deselects when in select mode.
    if (tool === 'select') {
      setSelectedId(null);
      return;
    }
    if (tool === 'text') {
      const p = evToImage(e);
      setPendingText({ x: p.x, y: p.y, value: '' });
      return;
    }
    const start = evToImage(e);
    if (tool === 'crop') {
      dragRef.current = { kind: 'crop', start };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    dragRef.current = { kind: 'draw', start };
    e.currentTarget.setPointerCapture(e.pointerId);
    setPreview(makeShape(tool, start, start, color, stroke));
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = evToImage(e);
    if (drag.kind === 'draw') {
      setPreview(makeShape(tool, drag.start, p, color, stroke));
    } else if (drag.kind === 'crop') {
      setPendingCrop(normalizeRect(drag.start, p));
    } else if (drag.kind === 'move') {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      setAnnotations(prev => prev.map(a => a.id === drag.id ? translate(drag.original, dx, dy) : a));
    }
  };

  const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    if (drag.kind === 'draw') {
      // Empty drag → cancel (no annotation).
      const p = preview;
      if (!p) return;
      const tooSmall = isTrivial(p);
      setPreview(null);
      if (tooSmall) return;
      const anno: Annotation = { ...p, id: newId() } as Annotation;
      setAnnotations(prev => [...prev, anno]);
      setSelectedId(anno.id);
      setTool('select');
    } else if (drag.kind === 'crop') {
      // Crop stays as a pending region until user confirms.
    } else if (drag.kind === 'move') {
      // Already updated in real-time; nothing to do.
    }
  };

  const handleAnnoDoubleClick = (anno: Annotation) => {
    if (anno.type !== 'text') return;
    setPendingText({ x: anno.x, y: anno.y, value: anno.text, editingId: anno.id });
  };

  // Keyboard: Delete/Backspace removes the selected annotation.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!selectedId) return;
      // Ignore when typing in a text input/textarea.
      if (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        setAnnotations(prev => prev.filter(a => a.id !== selectedId));
        setSelectedId(null);
      } else if (ev.key === 'Escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  // Commit pending text — create a new annotation, or update an existing one.
  const commitText = () => {
    if (!pendingText) return;
    const value = pendingText.value.trim();
    if (!value) {
      // Empty text on edit → delete that annotation; on new → discard.
      if (pendingText.editingId) {
        setAnnotations(prev => prev.filter(a => a.id !== pendingText.editingId));
      }
      setPendingText(null);
      return;
    }
    const fontSize = Math.max(16, stroke * 6);
    if (pendingText.editingId) {
      setAnnotations(prev => prev.map(a =>
        a.id === pendingText.editingId && a.type === 'text'
          ? { ...a, text: value }
          : a,
      ));
    } else {
      const anno: Annotation = {
        id: newId(),
        type: 'text',
        x: pendingText.x,
        y: pendingText.y,
        text: value,
        color,
        size: fontSize,
      };
      setAnnotations(prev => [...prev, anno]);
      setSelectedId(anno.id);
      setTool('select');
    }
    setPendingText(null);
  };

  const applyCrop = () => {
    if (!pendingCrop || !imageRef.current || !imageSize) return;
    // Crop the image: redraw onto a new image at the cropped size.
    const r = pendingCrop;
    const tmp = document.createElement('canvas');
    tmp.width = Math.round(r.w);
    tmp.height = Math.round(r.h);
    const tctx = tmp.getContext('2d')!;
    // Draw current image + mosaic baked into a source canvas.
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = imageSize.w;
    sourceCanvas.height = imageSize.h;
    const sctx = sourceCanvas.getContext('2d')!;
    sctx.drawImage(imageRef.current, 0, 0);
    for (const m of mosaicAnnos) applyMosaic(sctx, m);
    tctx.drawImage(sourceCanvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    // Replace the image with the cropped data.
    const newImg = new Image();
    newImg.onload = () => {
      imageRef.current = newImg;
      setImageSize({ w: newImg.naturalWidth, h: newImg.naturalHeight });
      // Translate remaining annotations to the new origin and drop those
      // outside the crop region.
      setAnnotations(prev =>
        prev
          .filter(a => a.type !== 'mosaic') // mosaic is baked into the new image
          .map(a => translate(a, -r.x, -r.y))
          .filter(a => withinBounds(a, newImg.naturalWidth, newImg.naturalHeight)),
      );
      setPendingCrop(null);
    };
    newImg.src = tmp.toDataURL('image/png');
  };

  const cancelCrop = () => setPendingCrop(null);

  const undoLast = () => {
    setAnnotations(prev => prev.slice(0, -1));
    setSelectedId(null);
  };

  const downloadAnnotated = async () => {
    const c = canvasRef.current;
    const svg = svgRef.current;
    if (!c || !svg || !imageSize) return;
    // Composite: draw canvas (image + mosaic) + serialize SVG and rasterize.
    const out = document.createElement('canvas');
    out.width = imageSize.w;
    out.height = imageSize.h;
    const octx = out.getContext('2d')!;
    octx.drawImage(c, 0, 0);
    // Serialize SVG WITHOUT selection chrome.
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('[data-chrome]').forEach(n => n.remove());
    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const svgImg = new Image();
    await new Promise<void>((resolve, reject) => {
      svgImg.onload = () => resolve();
      svgImg.onerror = reject;
      svgImg.src = svgUrl;
    }).catch(() => {});
    octx.drawImage(svgImg, 0, 0, imageSize.w, imageSize.h);
    URL.revokeObjectURL(svgUrl);
    out.toBlob(blob => {
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
    { id: 'select', label: 'Select / Move', icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3l7 17 2-7 7-2L5 3z" /></svg> },
    { id: 'rect',   label: 'Rectangle',     icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="4" y="6" width="16" height="12" rx="3" /></svg> },
    { id: 'circle', label: 'Ellipse',       icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><ellipse cx="12" cy="12" rx="8" ry="6" /></svg> },
    { id: 'arrow',  label: 'Arrow',         icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 19L19 5m0 0h-7m7 0v7" /></svg> },
    { id: 'mosaic', label: 'Mosaic',        icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></svg> },
    { id: 'text',   label: 'Text',          icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M12 6v14M9 20h6" /></svg> },
    { id: 'crop',   label: 'Crop',          icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 2v15a1 1 0 001 1h15M2 6h15a1 1 0 011 1v15" /></svg> },
  ], []);

  const btnClass = (active: boolean) =>
    `p-1.5 rounded transition-colors ${active ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-200'}`;

  // Imperatively position the inline text editor at image coords. It needs
  // both displaySize (for px conversion) and the pendingText image-coords.
  const scale = displaySize && imageSize ? displaySize.w / imageSize.w : 1;

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Tool bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white shrink-0 flex-wrap">
        {tools.map(t => (
          <button
            key={t.id}
            onClick={() => { setTool(t.id); setSelectedId(null); }}
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
              onClick={() => {
                setColor(c);
                if (selectedId) {
                  setAnnotations(prev => prev.map(a => a.id === selectedId && a.type !== 'mosaic'
                    ? ({ ...a, color: c } as Annotation) : a));
                }
              }}
              title={c}
              className={`h-5 w-5 rounded-full border ${color === c ? 'ring-2 ring-blue-500 ring-offset-1' : 'border-gray-300'}`}
              style={{ background: c }}
            />
          ))}
        </div>

        <div className="h-5 w-px bg-gray-300 mx-1" />

        {/* Stroke / size */}
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

        {/* Zoom */}
        <button onClick={() => setZoom(z => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100))} className="px-2 py-1 text-xs rounded hover:bg-gray-200 text-gray-700" title="Zoom out">−</button>
        <span className="text-[11px] text-gray-600 tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100))} className="px-2 py-1 text-xs rounded hover:bg-gray-200 text-gray-700" title="Zoom in">+</button>
        <button onClick={() => setZoom(1)} className="px-2 py-1 text-xs rounded hover:bg-gray-200 text-gray-700" title="Fit to area">Fit</button>

        <div className="h-5 w-px bg-gray-300 mx-1" />

        <button onClick={undoLast} disabled={annotations.length === 0} className="px-2 py-1 text-xs rounded hover:bg-gray-200 disabled:opacity-30 text-gray-700">Undo</button>
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

      {/* Canvas + SVG layered surface */}
      <div ref={wrapRef} className="flex-1 overflow-auto bg-gray-200 flex items-center justify-center p-4 relative">
        {displaySize && imageSize && (
          <div
            className="relative shadow-lg rounded overflow-hidden bg-white shrink-0"
            style={{ width: displaySize.w, height: displaySize.h }}
          >
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
            />
            <svg
              ref={svgRef}
              viewBox={`0 0 ${imageSize.w} ${imageSize.h}`}
              preserveAspectRatio="none"
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                touchAction: 'none',
                cursor: tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair',
              }}
              onPointerDown={handleSvgPointerDown}
              onPointerMove={handleSvgPointerMove}
              onPointerUp={handleSvgPointerUp}
              onPointerCancel={() => { dragRef.current = null; setPreview(null); }}
            >
              {annotations.map(a => (
                <AnnotationView
                  key={a.id}
                  anno={a}
                  selected={selectedId === a.id}
                  onPointerDown={(e) => handleAnnoPointerDown(e, a)}
                  onDoubleClick={() => handleAnnoDoubleClick(a)}
                />
              ))}
              {preview && <AnnotationView anno={{ ...preview, id: '__preview' } as Annotation} preview />}
              {pendingCrop && (
                <CropOverlay rect={pendingCrop} imageSize={imageSize} />
              )}
            </svg>

            {pendingText && (
              <div
                style={{
                  position: 'absolute',
                  left: `${pendingText.x * scale}px`,
                  top: `${pendingText.y * scale}px`,
                  transform: 'translateY(-2px)',
                  zIndex: 5,
                }}
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
        )}
      </div>

      {/* Hint footer */}
      <div className="px-3 py-1.5 border-t border-gray-200 bg-white text-[11px] text-gray-500 shrink-0">
        {tool === 'select'
          ? (selectedId ? 'Drag to move. Delete / Backspace removes. Click outside to deselect.' : 'Tap a shape to select it. Double-click text to edit.')
          : tool === 'text'
            ? 'Click to drop a text label.'
            : tool === 'crop'
              ? 'Drag a rectangle to set the crop region.'
              : 'Drag on the image to draw.'}
      </div>
    </div>
  );
}

// ── annotation rendering ─────────────────────────────────────────────────────

interface AnnoViewProps {
  anno: Annotation;
  selected?: boolean;
  preview?: boolean;
  onPointerDown?: (e: React.PointerEvent<SVGElement>) => void;
  onDoubleClick?: () => void;
}

function AnnotationView({ anno, selected, preview, onPointerDown, onDoubleClick }: AnnoViewProps) {
  // The selection outline is rendered as a sibling so it can use a different
  // stroke style without affecting the underlying shape.
  const dim = boundingBox(anno);
  const interactive: any = onPointerDown ? { onPointerDown, style: { cursor: 'move' } } : {};
  const dblc: any = onDoubleClick ? { onDoubleClick } : {};

  let body: JSX.Element;
  if (anno.type === 'rect') {
    const radius = Math.min(anno.w, anno.h, 16) * 0.4;
    body = (
      <rect
        x={anno.x} y={anno.y} width={anno.w} height={anno.h} rx={radius} ry={radius}
        fill="none" stroke={anno.color} strokeWidth={anno.stroke}
        strokeLinecap="round" strokeLinejoin="round"
        {...interactive}
      />
    );
  } else if (anno.type === 'circle') {
    body = (
      <ellipse
        cx={anno.x + anno.w / 2} cy={anno.y + anno.h / 2}
        rx={anno.w / 2} ry={anno.h / 2}
        fill="none" stroke={anno.color} strokeWidth={anno.stroke}
        {...interactive}
      />
    );
  } else if (anno.type === 'arrow') {
    body = (
      <ArrowShape anno={anno} interactive={interactive} />
    );
  } else if (anno.type === 'mosaic') {
    // The mosaic is baked into the canvas; here we render only an
    // invisible hit area for selection (no stroke when not selected).
    body = (
      <rect
        x={anno.x} y={anno.y} width={anno.w} height={anno.h}
        fill="rgba(0,0,0,0.001)"
        stroke={selected ? '#3b82f6' : 'none'}
        strokeWidth={selected ? 2 : 0}
        strokeDasharray={selected ? '6,4' : undefined}
        {...interactive}
      />
    );
  } else {
    // text
    body = (
      <text
        x={anno.x} y={anno.y + anno.size}
        fill={anno.color}
        fontSize={anno.size}
        fontWeight={600}
        fontFamily="-apple-system, system-ui, sans-serif"
        style={{ userSelect: 'none' }}
        {...interactive}
        {...dblc}
      >
        {anno.text.split('\n').map((line, i) => (
          <tspan key={i} x={anno.x} dy={i === 0 ? 0 : anno.size * 1.2}>{line}</tspan>
        ))}
      </text>
    );
  }

  return (
    <g>
      {body}
      {selected && !preview && (
        <rect
          data-chrome="selection"
          x={dim.x - 4} y={dim.y - 4}
          width={dim.w + 8} height={dim.h + 8}
          fill="none" stroke="#3b82f6" strokeWidth={2}
          strokeDasharray="6,4"
          pointerEvents="none"
        />
      )}
    </g>
  );
}

function ArrowShape({ anno, interactive }: { anno: Extract<Annotation, { type: 'arrow' }>; interactive: any }) {
  const headLen = Math.max(12, anno.stroke * 4);
  const angle = Math.atan2(anno.y2 - anno.y1, anno.x2 - anno.x1);
  const a1 = angle + Math.PI - Math.PI / 7;
  const a2 = angle + Math.PI + Math.PI / 7;
  const head = `M${anno.x2},${anno.y2} L${anno.x2 + headLen * Math.cos(a1)},${anno.y2 + headLen * Math.sin(a1)} L${anno.x2 + headLen * Math.cos(a2)},${anno.y2 + headLen * Math.sin(a2)} Z`;
  return (
    <g {...interactive}>
      <line
        x1={anno.x1} y1={anno.y1} x2={anno.x2} y2={anno.y2}
        stroke={anno.color} strokeWidth={anno.stroke} strokeLinecap="round"
      />
      <path d={head} fill={anno.color} />
    </g>
  );
}

function CropOverlay({ rect, imageSize }: { rect: { x: number; y: number; w: number; h: number }; imageSize: { w: number; h: number } }) {
  return (
    <g pointerEvents="none">
      {/* Dim the area outside the crop region */}
      <path
        d={`M0,0 H${imageSize.w} V${imageSize.h} H0 Z M${rect.x},${rect.y} V${rect.y + rect.h} H${rect.x + rect.w} V${rect.y} Z`}
        fill="rgba(0,0,0,0.45)"
        fillRule="evenodd"
      />
      <rect
        x={rect.x} y={rect.y} width={rect.w} height={rect.h}
        fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="8,6"
      />
    </g>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function makeShape(
  tool: Tool,
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: string,
  stroke: number,
): Annotation | null {
  if (tool === 'rect' || tool === 'circle') {
    const r = normalizeRect(start, end);
    return { id: '', type: tool, x: r.x, y: r.y, w: r.w, h: r.h, color, stroke };
  }
  if (tool === 'arrow') {
    return { id: '', type: 'arrow', x1: start.x, y1: start.y, x2: end.x, y2: end.y, color, stroke };
  }
  if (tool === 'mosaic') {
    const r = normalizeRect(start, end);
    return { id: '', type: 'mosaic', x: r.x, y: r.y, w: r.w, h: r.h };
  }
  return null;
}

function isTrivial(a: Annotation): boolean {
  if (a.type === 'arrow') {
    return Math.abs(a.x2 - a.x1) < 4 && Math.abs(a.y2 - a.y1) < 4;
  }
  if ('w' in a && 'h' in a) {
    return a.w < 4 || a.h < 4;
  }
  return false;
}

function translate(a: Annotation, dx: number, dy: number): Annotation {
  if (a.type === 'arrow') {
    return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
  }
  if (a.type === 'text') {
    return { ...a, x: a.x + dx, y: a.y + dy };
  }
  // rect/circle/mosaic
  return { ...a, x: a.x + dx, y: a.y + dy } as Annotation;
}

function boundingBox(a: Annotation): { x: number; y: number; w: number; h: number } {
  if (a.type === 'arrow') {
    const x = Math.min(a.x1, a.x2);
    const y = Math.min(a.y1, a.y2);
    return { x, y, w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
  }
  if (a.type === 'text') {
    // Rough bbox — width estimated from char count, height from size with line count.
    const lines = a.text.split('\n');
    const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
    return { x: a.x, y: a.y, w: longest * a.size * 0.55, h: lines.length * a.size * 1.2 };
  }
  return { x: a.x, y: a.y, w: a.w, h: a.h };
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}

function withinBounds(a: Annotation, w: number, h: number): boolean {
  const bb = boundingBox(a);
  return bb.x + bb.w > 0 && bb.y + bb.h > 0 && bb.x < w && bb.y < h;
}

// Mosaic: average each MOSAIC_BLOCK×MOSAIC_BLOCK chunk into a single color.
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
