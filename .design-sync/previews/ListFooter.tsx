import { ListFooter } from 'react-os-shell';

// ListFooter — the standardized status line at the bottom of an EntityList.
// It summarizes how many records are loaded vs. the total, an optional
// selection count, and a "loading more" hint during infinite scroll.
function FooterRow({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wide text-gray-400">{caption}</span>
      <span className="text-sm text-gray-600">{children}</span>
    </div>
  );
}

export function States() {
  return (
    <div className="p-5">
      <div className="max-w-md divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        <FooterRow caption="Partially loaded">
          <ListFooter selectedCount={0} loadedCount={50} totalCount={1284} label="orders" />
        </FooterRow>
        <FooterRow caption="With selection">
          <ListFooter selectedCount={3} loadedCount={50} totalCount={1284} label="orders" />
        </FooterRow>
        <FooterRow caption="Fetching more">
          <ListFooter selectedCount={0} loadedCount={100} totalCount={1284} label="orders" isFetchingMore />
        </FooterRow>
        <FooterRow caption="All loaded">
          <ListFooter selectedCount={0} loadedCount={1284} totalCount={1284} label="orders" />
        </FooterRow>
      </div>
    </div>
  );
}

// As it appears anchored under a real list.
export function UnderList() {
  return (
    <div className="p-5">
      <div className="max-w-md overflow-hidden rounded-lg border border-gray-200 bg-white">
        {['SUP-0019  ·  Anhui Foods', 'SUP-0020  ·  Pacific Textiles', 'SUP-0021  ·  Nordic Steel'].map((r) => (
          <div key={r} className="border-b border-gray-100 px-3 py-2 font-mono text-xs text-gray-700">{r}</div>
        ))}
        <div className="bg-gray-50 px-3 py-2 text-xs text-gray-500">
          <ListFooter selectedCount={1} loadedCount={120} totalCount={342} label="suppliers" />
        </div>
      </div>
    </div>
  );
}
