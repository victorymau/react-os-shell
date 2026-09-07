/**
 * Where a format panel's toolbar buttons go.
 *
 * Inside the Preview window there is one toolbar row — Open, the filename,
 * then a slot at its right end — and each panel (PDF, DXF, 3D, image) portals
 * its own page nav / zoom / layer / download buttons into that slot rather
 * than stacking a second row under it. `ToolbarSlotContext` carries the slot
 * element down.
 *
 * Outside Preview there is no slot, and there is no outer toolbar to merge
 * with either: an embedded `PdfViewer` is the whole widget. So the fallback
 * renders the buttons in place as the panel's own toolbar. It used to return
 * `null`, which was right while every panel lived in a window and wrong the
 * moment one did not — an embedded viewer with no page nav and no zoom.
 */
import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

export const ToolbarSlotContext = createContext<HTMLElement | null>(null);

export function PanelActions({ children }: { children: React.ReactNode }) {
  const slot = useContext(ToolbarSlotContext);
  if (slot) return createPortal(children, slot);
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs">
      {children}
    </div>
  );
}
