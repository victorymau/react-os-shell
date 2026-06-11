import { useMemo, useRef, useState } from 'react';
import {
  SearchableSelect,
  StatusBadge,
  PopupMenu,
  PopupMenuItem,
  PopupMenuDivider,
  PopupMenuLabel,
  toast,
  type SearchableOption,
} from 'react-os-shell';

/**
 * Demo for the shell's form-control primitives:
 *
 * - <SearchableSelect> — combobox-style input: type to filter a fixed list,
 *   hover-× to clear, Enter picks a unique match, free-text and async-search
 *   modes, and a right-adornment slot for status pills.
 * - <PopupMenu> — the same frosted-glass menu the shell uses for every
 *   context menu, opened here from a button.
 */

const COUNTRIES: SearchableOption[] = [
  { value: 'de', label: 'Germany', sublabel: 'EU' },
  { value: 'fr', label: 'France', sublabel: 'EU' },
  { value: 'it', label: 'Italy', sublabel: 'EU' },
  { value: 'nl', label: 'Netherlands', sublabel: 'EU' },
  { value: 'pl', label: 'Poland', sublabel: 'EU' },
  { value: 'uk', label: 'United Kingdom', sublabel: 'EMEA' },
  { value: 'no', label: 'Norway', sublabel: 'EMEA' },
  { value: 'ch', label: 'Switzerland', sublabel: 'EMEA' },
  { value: 'us', label: 'United States', sublabel: 'AMER' },
  { value: 'ca', label: 'Canada', sublabel: 'AMER' },
  { value: 'mx', label: 'Mexico', sublabel: 'AMER' },
  { value: 'jp', label: 'Japan', sublabel: 'APAC' },
  { value: 'kr', label: 'South Korea', sublabel: 'APAC' },
  { value: 'au', label: 'Australia', sublabel: 'APAC' },
  { value: 'nz', label: 'New Zealand', sublabel: 'APAC' },
];

const ORDERS: SearchableOption[] = [
  { value: 'so-27201', label: 'SO#27201 — Alpine Wheels GmbH', sublabel: 'Jun 02' },
  { value: 'so-27188', label: 'SO#27188 — Kessler Automotive', sublabel: 'May 28' },
  { value: 'so-27165', label: 'SO#27165 — Nordlicht Motors', sublabel: 'May 21' },
  { value: 'so-27154', label: 'SO#27154 — Vértice Racing', sublabel: 'May 17' },
  { value: 'so-27149', label: 'SO#27149 — Hayashi Trading', sublabel: 'May 12' },
];

const ORDER_STATUS: Record<string, string> = {
  'so-27201': 'in_production',
  'so-27188': 'paid',
  'so-27165': 'pending',
  'so-27154': 'overdue',
  'so-27149': 'delivered',
};

// A "server" of parts — the async variant filters this with fake latency,
// like fronting a paginated endpoint via onSearchChange.
const ALL_PARTS = Array.from({ length: 250 }, (_, i) => ({
  value: `pn-${1000 + i}`,
  label: `PN-${1000 + i} forged wheel ${15 + (i % 8)}×${7 + (i % 5)}`,
  sublabel: ['gloss black', 'brushed', 'polished', 'matte bronze'][i % 4],
}));

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

export default function FormControlsDemo() {
  const [country, setCountry] = useState('');
  const [order, setOrder] = useState('so-27201');
  const [tag, setTag] = useState('');
  const [part, setPart] = useState('');
  const [partOptions, setPartOptions] = useState<SearchableOption[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Async mode: debounce the typed text, then "fetch" matching parts.
  const onPartSearch = (text: string) => {
    clearTimeout(searchTimer.current);
    if (!text.trim()) { setPartOptions([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(() => {
      const q = text.toLowerCase();
      setPartOptions(ALL_PARTS.filter(p => p.label.toLowerCase().includes(q) || p.sublabel.toLowerCase().includes(q)).slice(0, 25));
      setSearching(false);
    }, 250);
  };

  // Keep the selected part visible in the options once picked.
  const partOpts = useMemo(() => {
    const selected = ALL_PARTS.find(p => p.value === part);
    return selected && !partOptions.some(o => o.value === part) ? [selected, ...partOptions] : partOptions;
  }, [part, partOptions]);

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <div className="p-5 max-w-3xl">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">SearchableSelect</h2>
        <p className="mt-1 text-sm text-gray-500">
          A combobox that reads as a normal form input: focus and type to
          filter, <span className="font-medium">Enter</span> picks a unique
          match, hover the field for the clear ×. The dropdown is the shell's
          frosted glass, so it follows every color theme.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
        <Field label="Basic" hint="15 options, filtered as you type — try “new”.">
          <SearchableSelect value={country} onChange={setCountry} options={COUNTRIES} placeholder="Pick a country…" />
        </Field>

        <Field label="Sublabels + right adornment" hint="Status pill rides in the field; sublabels are searchable too.">
          <SearchableSelect
            value={order}
            onChange={setOrder}
            options={ORDERS}
            placeholder="Pick a sales order…"
            rightAdornment={order ? <StatusBadge status={ORDER_STATUS[order] ?? 'draft'} /> : undefined}
          />
        </Field>

        <Field label="Free text (allowFreeText)" hint="Pick a suggestion or type your own and press Enter.">
          <SearchableSelect
            value={tag}
            onChange={setTag}
            options={[
              { value: 'urgent', label: 'urgent' },
              { value: 'follow-up', label: 'follow-up' },
              { value: 'q3-launch', label: 'q3-launch' },
            ]}
            placeholder="Add a tag…"
            allowFreeText
          />
        </Field>

        <Field label="Async search (onSearchChange)" hint={searching ? 'Searching…' : 'Type to query a 250-part “server” with 250 ms latency — try “bronze”.'}>
          <SearchableSelect
            value={part}
            onChange={setPart}
            options={partOpts}
            placeholder="Search part numbers…"
            emptyOptionLabel="Search part numbers…"
            onSearchChange={onPartSearch}
          />
        </Field>

        <Field label="Disabled">
          <SearchableSelect value="" onChange={() => {}} options={COUNTRIES} placeholder="Locked while the order is posted" disabled />
        </Field>
      </div>

      <div className="mt-8 mb-4 border-t border-gray-200 pt-5">
        <h2 className="text-base font-semibold text-gray-900">PopupMenu</h2>
        <p className="mt-1 text-sm text-gray-500">
          The same frosted-glass menu behind every shell context menu —
          labels, items, dividers, danger styling — opened from a button here.
        </p>
      </div>
      <button
        onClick={e => setMenu({ x: e.clientX, y: e.clientY })}
        className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-sm"
      >
        Open menu…
      </button>
      {menu && (
        // `portal` is required for menus opened from inside a window — the
        // window panel re-anchors and clips `fixed` children otherwise.
        <PopupMenu portal style={{ left: menu.x, top: menu.y }} onClose={() => setMenu(null)} minWidth={180}>
          <PopupMenuLabel>Sales order</PopupMenuLabel>
          <PopupMenuItem onClick={() => { toast.success('Duplicated.'); setMenu(null); }}>Duplicate</PopupMenuItem>
          <PopupMenuItem onClick={() => { toast.success('Exported as PDF.'); setMenu(null); }}>Export PDF</PopupMenuItem>
          <PopupMenuDivider />
          <PopupMenuItem danger onClick={() => { toast.error('Cancelled.'); setMenu(null); }}>Cancel order</PopupMenuItem>
        </PopupMenu>
      )}
    </div>
  );
}
