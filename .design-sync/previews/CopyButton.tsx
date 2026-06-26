import { CopyButton } from 'react-os-shell';

// CopyButton — an inline icon button that copies a value to the clipboard and
// briefly flips to a green check. Pair it with the value it copies so the
// affordance reads clearly.
export function NextToValues() {
  const rows = [
    { label: 'Order ID', value: 'ORD-2026-004812' },
    { label: 'Tracking', value: '1Z999AA10123456784' },
    { label: 'API key', value: 'sk_live_8Hf2…a91' },
  ];
  return (
    <div className="p-5">
      <div className="max-w-sm divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-400">{r.label}</div>
              <div className="font-mono text-sm text-gray-800">{r.value}</div>
            </div>
            <CopyButton text={r.value} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Inline within a sentence of context.
export function Inline() {
  return (
    <div className="p-5">
      <div className="inline-flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
        <span className="text-gray-500">Reference</span>
        <span className="font-mono text-gray-900">INV-1042</span>
        <CopyButton text="INV-1042" />
      </div>
    </div>
  );
}
