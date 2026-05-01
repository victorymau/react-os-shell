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

  // Drag state — used for drawing, moving, and resizing. `start` is the
  // pointer's image-coord at down; `original` is a snapshot so deltas apply
  // against the at-down state, not the running state.
  type Corner = 'nw' | 'ne' | 'se' | 'sw' | 'start' | 'end';
  const dragRef = useRef<
    | { kind: 'draw'; start: { x: number; y: number } }
    | { kind: 'move'; id: string; start: { x: number; y: number }; original: Annotation }
    | { kind: 'resize'; id: string; corner: Corner; start: { x: number; y: number }; original: Annotation }
    | { kind: 'crop'; start: { x: number; y: number } }
    | null
  >(null);
  const [isDragging, setIsDragging] = useState(false);

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
  // mosaic set changes or the source image changes. We also depend on
  // `fitSize` so the effect re-runs the moment the canvas actually mounts
  // (the canvas is conditionally rendered only when displaySize / fitSize is
  // available — otherwise the first run finds canvasRef.current === null and
  // bails, leaving the canvas blank until the user happens to make any other
  // state change that re-triggers this effect).
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
  }, [imageSize, mosaicAnnos, fitSize]);

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

  // ── selection / drag (window-level listeners) ─────────────────────────────
  // We attach pointermove/pointerup on the window when dragging so the gesture
  // keeps working even if the cursor leaves the SVG (common at high zoom or
  // when scrolled). All coord conversion still goes through SVG's CTM, so
  // zoom doesn't affect anything.
  const beginDrag = (drag: NonNullable<typeof dragRef.current>) => {
    dragRef.current = drag;
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const p = evToImage(ev);
      if (drag.kind === 'draw') {
        setPreview(makeShape(tool, drag.start, p, color, stroke));
      } else if (drag.kind === 'crop') {
        setPendingCrop(normalizeRect(drag.start, p));
      } else if (drag.kind === 'move') {
        const dx = p.x - drag.start.x;
        const dy = p.y - drag.start.y;
        setAnnotations(prev => prev.map(a => a.id === drag.id ? translate(drag.original, dx, dy) : a));
      } else if (drag.kind === 'resize') {
        setAnnotations(prev => prev.map(a => a.id === drag.id ? resize(drag.original, drag.corner, p) : a));
      }
    };
    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      setIsDragging(false);
      if (drag?.kind === 'draw') {
        // Read latest preview directly from state via the setter.
        setPreview(p => {
          if (!p || isTrivial(p)) return null;
          const anno: Annotation = { ...p, id: newId() } as Annotation;
          setAnnotations(prev => [...prev, anno]);
          setSelectedId(anno.id);
          setTool('select');
          return null;
        });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isDragging, tool, color, stroke]);

  const handleAnnoPointerDown = (e: React.PointerEvent<SVGElement>, anno: Annotation) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelectedId(anno.id);
    beginDrag({ kind: 'move', id: anno.id, start: evToImage(e), original: anno });
  };

  const handleHandlePointerDown = (e: React.PointerEvent<SVGElement>, anno: Annotation, corner: Corner) => {
    e.stopPropagation();
    beginDrag({ kind: 'resize', id: anno.id, corner, start: evToImage(e), original: anno });
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
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
      beginDrag({ kind: 'crop', start });
      return;
    }
    setPreview(makeShape(tool, start, start, color, stroke));
    beginDrag({ kind: 'draw', start });
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

  // Composite the current canvas + SVG layers into an off-screen canvas at
  // full image resolution. Used by both Save (download) and Copy (clipboard).
  const compositeToCanvas = async (): Promise<HTMLCanvasElement | null> => {
    const c = canvasRef.current;
    const svg = svgRef.current;
    if (!c || !svg || !imageSize) return null;
    const out = document.createElement('canvas');
    out.width = imageSize.w;
    out.height = imageSize.h;
    const octx = out.getContext('2d')!;
    octx.drawImage(c, 0, 0);
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('[data-chrome]').forEach(n => n.remove());
    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const svgImg = new Image();
    await new Promise<void>((resolve) => {
      svgImg.onload = () => resolve();
      svgImg.onerror = () => resolve();
      svgImg.src = svgUrl;
    });
    octx.drawImage(svgImg, 0, 0, imageSize.w, imageSize.h);
    URL.revokeObjectURL(svgUrl);
    return out;
  };

  const downloadAnnotated = async () => {
    const out = await compositeToCanvas();
    if (!out) return;
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

  const copyToClipboard = async () => {
    if (!('clipboard' in navigator) || typeof ClipboardItem === 'undefined') {
      toast.error('Clipboard images are not supported in this browser');
      return;
    }
    const out = await compositeToCanvas();
    if (!out) return;
    out.toBlob(async blob => {
      if (!blob) { toast.error('Failed to copy'); return; }
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast.success('Copied to clipboard');
      } catch {
        toast.error('Copy failed (clipboard permission?)');
      }
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
        <button onClick={copyToClipboard} className="px-2 py-1 text-xs rounded hover:bg-gray-200 text-gray-700">Copy</button>
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
            >
              {annotations.map(a => (
                <AnnotationView
                  key={a.id}
                  anno={a}
                  selected={selectedId === a.id}
                  zoom={zoom}
                  onPointerDown={(e) => handleAnnoPointerDown(e, a)}
                  onDoubleClick={() => handleAnnoDoubleClick(a)}
                  onHandlePointerDown={(e, corner) => handleHandlePointerDown(e, a, corner)}
                />
              ))}
              {preview && <AnnotationView anno={{ ...preview, id: '__preview' } as Annotation} preview />}
              {pendingCrop && (
                <CropOverlay rect={pendingCrop} imageSize={imageSize} />
              )}
            </svg>

            {pendingText && (
              <PendingTextEditor
                pendingText={pendingText}
                color={color}
                scale={scale}
                onChange={(value) => setPendingText({ ...pendingText, value })}
                onCommit={commitText}
                onCancel={() => setPendingText(null)}
              />
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
  zoom?: number;
  onPointerDown?: (e: React.PointerEvent<SVGElement>) => void;
  onDoubleClick?: () => void;
  onHandlePointerDown?: (e: React.PointerEvent<SVGElement>, corner: 'nw' | 'ne' | 'se' | 'sw' | 'start' | 'end') => void;
}

function AnnotationView({ anno, selected, preview, zoom = 1, onPointerDown, onDoubleClick, onHandlePointerDown }: AnnoViewProps) {
  const dim = boundingBox(anno);
  // pointerEvents="all" is critical: with fill="none", default pointer-events
  // would only catch clicks on the (often-thin) stroke. "all" makes the entire
  // bounding shape hit-testable so selection works at any zoom level.
  const interactive: any = onPointerDown
    ? { onPointerDown, pointerEvents: 'all', style: { cursor: 'move' } }
    : {};
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
        <>
          <rect
            data-chrome="selection"
            x={dim.x - 4} y={dim.y - 4}
            width={dim.w + 8} height={dim.h + 8}
            fill="none" stroke="#3b82f6" strokeWidth={2 / zoom}
            strokeDasharray={`${6 / zoom},${4 / zoom}`}
            pointerEvents="none"
          />
          {onHandlePointerDown && <ResizeHandles anno={anno} zoom={zoom} onHandlePointerDown={onHandlePointerDown} />}
        </>
      )}
    </g>
  );
}

/** Resize handles for selected annotation. 4 corners for shapes/mosaic;
 *  2 endpoints for arrow. Text isn't resizable here (use the Size slider in
 *  the toolbar to change its font size). All handle dimensions are divided
 *  by the current zoom level so they stay a constant ~10 px on screen. */
function ResizeHandles({
  anno, zoom, onHandlePointerDown,
}: {
  anno: Annotation;
  zoom: number;
  onHandlePointerDown: (e: React.PointerEvent<SVGElement>, corner: 'nw' | 'ne' | 'se' | 'sw' | 'start' | 'end') => void;
}) {
  const r = 6 / zoom;
  const sw = 1.5 / zoom;
  const handleProps = (cursor: string) => ({
    fill: '#fff',
    stroke: '#3b82f6',
    strokeWidth: sw,
    pointerEvents: 'all' as const,
    style: { cursor } as React.CSSProperties,
  });

  if (anno.type === 'arrow') {
    return (
      <>
        <circle cx={anno.x1} cy={anno.y1} r={r} {...handleProps('grab')} data-chrome="handle" onPointerDown={(e) => onHandlePointerDown(e, 'start')} />
        <circle cx={anno.x2} cy={anno.y2} r={r} {...handleProps('grab')} data-chrome="handle" onPointerDown={(e) => onHandlePointerDown(e, 'end')} />
      </>
    );
  }
  if (anno.type === 'text') {
    return null; // resize text via the toolbar slider
  }
  // rect / circle / mosaic
  const x = anno.x;
  const y = anno.y;
  const w = anno.w;
  const h = anno.h;
  return (
    <>
      <circle cx={x}     cy={y}     r={r} {...handleProps('nwse-resize')} data-chrome="handle" onPointerDown={(e) => onHandlePointerDown(e, 'nw')} />
      <circle cx={x + w} cy={y}     r={r} {...handleProps('nesw-resize')} data-chrome="handle" onPointerDown={(e) => onHandlePointerDown(e, 'ne')} />
      <circle cx={x + w} cy={y + h} r={r} {...handleProps('nwse-resize')} data-chrome="handle" onPointerDown={(e) => onHandlePointerDown(e, 'se')} />
      <circle cx={x}     cy={y + h} r={r} {...handleProps('nesw-resize')} data-chrome="handle" onPointerDown={(e) => onHandlePointerDown(e, 'sw')} />
    </>
  );
}

/** Inline textarea overlay for new / editing text annotations. Manual focus
 *  via ref + useEffect — `autoFocus` was unreliable on freshly-mounted
 *  elements after the SVG had captured the prior pointer event. Stopping
 *  pointer events from bubbling keeps SVG handlers from interfering. */
function PendingTextEditor({
  pendingText, color, scale, onChange, onCommit, onCancel,
}: {
  pendingText: { x: number; y: number; value: string; editingId?: string };
  color: string;
  scale: number;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // requestAnimationFrame so the element is laid out before focus —
    // some browsers ignore focus on a freshly-mounted element otherwise.
    const id = requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select?.();
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      style={{
        position: 'absolute',
        left: `${pendingText.x * scale}px`,
        top: `${pendingText.y * scale}px`,
        transform: 'translateY(-2px)',
        zIndex: 5,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={ref}
        value={pendingText.value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(); }
        }}
        placeholder="Type then Enter…"
        rows={1}
        className="bg-white/95 border border-blue-400 rounded px-1 py-0.5 text-sm outline-none resize-none shadow-md"
        style={{ color, fontWeight: 600, minWidth: 80 }}
      />
    </div>
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

/** Apply a resize gesture to an annotation. `corner` identifies which handle
 *  is being dragged; `p` is the current pointer's image-coord. The result is
 *  a normalised annotation (always positive w/h). */
function resize(
  original: Annotation,
  corner: 'nw' | 'ne' | 'se' | 'sw' | 'start' | 'end',
  p: { x: number; y: number },
): Annotation {
  if (original.type === 'arrow') {
    if (corner === 'start') return { ...original, x1: p.x, y1: p.y };
    if (corner === 'end')   return { ...original, x2: p.x, y2: p.y };
    return original;
  }
  if (original.type === 'text') return original;
  // rect / circle / mosaic — opposite-corner stays anchored.
  const left   = original.x;
  const right  = original.x + original.w;
  const top    = original.y;
  const bottom = original.y + original.h;
  let x1 = left, y1 = top, x2 = right, y2 = bottom;
  if (corner === 'nw') { x1 = p.x; y1 = p.y; }
  if (corner === 'ne') { x2 = p.x; y1 = p.y; }
  if (corner === 'se') { x2 = p.x; y2 = p.y; }
  if (corner === 'sw') { x1 = p.x; y2 = p.y; }
  const r = normalizeRect({ x: x1, y: y1 }, { x: x2, y: y2 });
  return { ...original, x: r.x, y: r.y, w: r.w, h: r.h } as Annotation;
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
