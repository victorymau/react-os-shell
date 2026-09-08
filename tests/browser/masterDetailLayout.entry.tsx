import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import MasterDetailLayout from '../../src/shell/MasterDetailLayout';

function Example() {
  const [selected, setSelected] = useState<number | null>(null);
  return <main id="layout-container" style={{ width: 960, height: 500 }}>
    <MasterDetailLayout selected={selected !== null} onBack={() => setSelected(null)}
      defaultWidth={300} list={
        <><input aria-label="Filter records" defaultValue="All" />
          {Array.from({ length: 50 }, (_, index) => <button key={index}
            className="shrink-0 h-11 text-left px-3" onClick={() => setSelected(index)}>Record {index + 1}</button>)}
        </>
      }>
      <div className="flex-1 overflow-y-auto p-4"><h1>Record details</h1><input aria-label="Draft" defaultValue="Keep this draft" /></div>
    </MasterDetailLayout>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Example />);
