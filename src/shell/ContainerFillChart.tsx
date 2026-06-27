/**
 * ContainerFillChart — visualises a loading list as one or more shipping
 * containers and their fill percentage. The volume of each line is
 * `quantity * volumePerUnit`; the chart sizes containers (20ft = 33 m³, 40ft
 * = 67 m³, preferring 20ft when the volume fits within +5%) and draws a fill
 * bar per container slot.
 *
 * Dual-bar mode (instruction vs loaded): when actual quantities exist on the
 * items, each container row layers two bars — blue for instruction volume,
 * green for loaded volume. Whichever is larger is rendered first (background);
 * the smaller one sits on top so both are simultaneously visible.
 *
 * Product-agnostic: this component does NO fetching. The per-unit volume of
 * each item is supplied by the consumer via `getVolume(item)` (typically a
 * lookup into a part-number → volume map the app fetched). Quantity and
 * "new" extraction default to the common `quantity` / `actual_qty` / `_isNew`
 * field names but are overridable so the chart isn't tied to any one shape.
 */
import type { CSSProperties } from 'react';

const C20 = 33; // 20ft container m³
const C40 = 67; // 40ft container m³

/** Default item shape — overridable via the accessor props for any other shape. */
export interface ContainerFillItem {
  quantity?: number | null;
  actual_qty?: number | null;
  _isNew?: boolean;
}

export interface ContainerFillChartProps<T = ContainerFillItem> {
  /** Line items to chart. Each contributes `qty * getVolume(item)` to the total. */
  items: T[];
  /**
   * Per-unit volume (m³) for an item. The lifted app concern — return 0 when
   * unknown. Total volume per item is `quantity * getVolume(item)`.
   */
  getVolume: (item: T) => number;
  /**
   * Single-bar quantity source when no actuals are present:
   *  - 'instruction' (default): use the instruction quantity.
   *  - 'actual':                use the actual quantity (falling back to instruction).
   *
   * When actuals exist on at least one item the chart auto-switches to dual-bar
   * mode regardless of `qtyField` — instruction (blue) and loaded (green) are
   * layered into the same bar so both are visible at once.
   */
  qtyField?: 'instruction' | 'actual';
  /** Show the "new items" indicator next to the row count. */
  showNewIndicator?: boolean;
  /** Instruction quantity accessor. Defaults to `item.quantity`. */
  getInstructionQty?: (item: T) => number | null | undefined;
  /** Actual/loaded quantity accessor. Defaults to `item.actual_qty`. */
  getActualQty?: (item: T) => number | null | undefined;
  /**
   * Whether an item should count as charted at all. Defaults to "has a non-empty
   * key" — i.e. items whose volume source identifies a real part. By default
   * every item is charted; supply this to drop placeholder/empty rows.
   */
  isFilled?: (item: T) => boolean;
  /** Whether an item is newly added (drives `showNewIndicator`). Defaults to `item._isNew`. */
  isNew?: (item: T) => boolean;
  className?: string;
  style?: CSSProperties;
}

const toInt = (v: unknown) => (typeof v === 'number' ? v : parseInt(String(v ?? '')) || 0);

/**
 * Container-fill chart for shipping loading lists. Presentational only — pass
 * `getVolume` to inject per-unit volumes; the chart owns the container math and
 * the instruction-vs-loaded dual-bar rendering.
 */
export default function ContainerFillChart<T = ContainerFillItem>({
  items,
  getVolume,
  qtyField = 'instruction',
  showNewIndicator = false,
  getInstructionQty = (item) => (item as ContainerFillItem).quantity,
  getActualQty = (item) => (item as ContainerFillItem).actual_qty,
  isFilled,
  isNew = (item) => Boolean((item as ContainerFillItem)._isNew),
  className,
  style,
}: ContainerFillChartProps<T>) {
  const filledLines = isFilled ? items.filter(isFilled) : items;

  // Instruction quantity always comes from the instruction accessor. Actual
  // quantity comes from the actual accessor (and counts as 0 when missing — the
  // auto-detect uses that to decide whether to draw the second layer).
  const qtyInstr = (l: T) => toInt(getInstructionQty(l));
  const qtyActual = (l: T) => toInt(getActualQty(l));

  const hasActual = filledLines.some((l) => getActualQty(l) != null && qtyActual(l) > 0);

  // Single-bar fallback: when there are no actuals at all, honor `qtyField` so
  // callers (e.g. a create form) still get an instruction-only chart even if
  // they pass qtyField='actual' at a stage where actuals don't exist yet.
  const qtyOf = (l: T) => {
    if (hasActual) return qtyInstr(l); // dual mode: this branch isn't actually used; we compute both totals separately below
    return qtyField === 'actual' ? (getActualQty(l) ?? getInstructionQty(l) ?? 0) : (getInstructionQty(l) ?? 0);
  };
  const totalQty = filledLines.reduce((s, l) => s + toInt(qtyOf(l)), 0);
  const newCount = filledLines.filter((l) => isNew(l)).length;
  const newQty = filledLines.filter((l) => isNew(l)).reduce((s, l) => s + toInt(qtyOf(l)), 0);

  // Per-mode totals.
  const totalQtyInstr = filledLines.reduce((s, l) => s + qtyInstr(l), 0);
  const totalQtyActual = filledLines.reduce((s, l) => s + qtyActual(l), 0);
  const totalVolumeInstr = filledLines.reduce((s, l) => s + getVolume(l) * qtyInstr(l), 0);
  const totalVolumeActual = filledLines.reduce((s, l) => s + getVolume(l) * qtyActual(l), 0);

  // The display volume drives container sizing + count. In dual mode we use the
  // larger of the two totals so neither layer gets visually clipped; in single
  // mode we fall back to whichever side has data.
  const totalVolume = hasActual
    ? Math.max(totalVolumeInstr, totalVolumeActual)
    : qtyField === 'actual'
      ? totalVolumeActual || totalVolumeInstr
      : totalVolumeInstr;

  // Prefer 20ft when it (the larger of the two volumes) fits within +5%.
  const useType = totalVolume <= C20 * 1.05 ? '20ft' : '40ft';
  const containerCap = useType === '20ft' ? C20 : C40;
  const totalContainers = totalVolume > 0 ? Math.max(1, Math.ceil(totalVolume / containerCap)) : 0;

  const totalCap = totalContainers * containerCap;
  const isOptimal = totalVolume > 0 && totalVolume >= totalCap * 0.95 && totalVolume <= totalCap * 1.1;

  if (filledLines.length === 0) return null;

  // Per-container fill percentages — split totals across N container slots.
  // Returned values can briefly exceed 100 for the last slot if the total
  // volume sits between (n-1)*cap and n*cap; we clamp at the render layer.
  const fillFor = (volume: number, idx: number) =>
    containerCap > 0 ? Math.max(0, Math.min(((volume - idx * containerCap) / containerCap) * 100, 100)) : 0;

  return (
    <div className={`mt-2 px-1 space-y-2 ${className ?? ''}`.trim()} style={style}>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {filledLines.length} items &middot; {totalQty} pcs
          {hasActual && totalQtyInstr !== totalQtyActual && (
            <span className="ml-1 text-gray-400">({totalQtyInstr} instr / {totalQtyActual} loaded)</span>
          )}
        </span>
        {showNewIndicator && newCount > 0 && (
          <span className="flex items-center gap-1 text-green-600">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {newCount} new ({newQty} pcs)
          </span>
        )}
      </div>
      {totalVolume > 0 ? (
        <div className="space-y-1.5">
          {Array.from({ length: totalContainers }).map((_, i) => {
            const instrPct = fillFor(totalVolumeInstr, i);
            const actualPct = fillFor(totalVolumeActual, i);
            // Dual mode: layer the bigger one underneath, smaller one on top (so
            // the smaller bar's color shows in its range and the bigger bar's
            // color shows in the difference range).
            const dual = hasActual;
            const longerPct = Math.max(instrPct, actualPct);
            const shorterPct = Math.min(instrPct, actualPct);
            const longerIsInstr = instrPct >= actualPct;
            const longerColor = dual ? (longerIsInstr ? 'bg-blue-500' : 'bg-green-500') : 'bg-blue-500';
            const shorterColor = dual ? (longerIsInstr ? 'bg-green-500' : 'bg-blue-500') : '';
            return (
              <div key={`bar-${i}`} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-8 shrink-0">{useType}</span>
                <div className="relative flex-1 h-4 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                  {/* Background = the longer bar */}
                  <div className={`absolute inset-y-0 left-0 ${longerColor} transition-all`} style={{ width: `${longerPct}%` }} />
                  {/* Foreground (dual mode only) = the shorter bar, layered on top */}
                  {dual && shorterPct > 0 && (
                    <div className={`absolute inset-y-0 left-0 ${shorterColor} transition-all`} style={{ width: `${shorterPct}%` }} />
                  )}
                </div>
                <span className="text-[10px] text-gray-500 w-16 text-right">
                  {dual
                    ? `${Math.min(totalVolumeActual - i * containerCap, containerCap).toFixed(1)} / ${containerCap} m³`
                    : `${Math.min(totalVolumeInstr - i * containerCap, containerCap).toFixed(1)} / ${containerCap} m³`}
                </span>
              </div>
            );
          })}
          <div className="flex items-center justify-between text-xs pt-0.5">
            <span className="text-gray-500 inline-flex items-center gap-1">
              Total:
              {hasActual ? (
                <>
                  <span className="inline-flex items-center gap-1 text-blue-700">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                    {totalVolumeInstr.toFixed(2)} m³ instruction
                  </span>
                  <span className="text-gray-400">/</span>
                  <span className="inline-flex items-center gap-1 text-green-700">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                    {totalVolumeActual.toFixed(2)} m³ loaded
                  </span>
                </>
              ) : (
                <b className="text-gray-700">{totalVolume.toFixed(2)} m³</b>
              )}
            </span>
            <span className={`font-medium ${isOptimal ? 'text-green-600' : 'text-gray-500'}`}>
              {isOptimal && '✓ '}
              {totalContainers} × {useType}
            </span>
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-400">Volume: N/A (no volume data for these part numbers)</div>
      )}
    </div>
  );
}
