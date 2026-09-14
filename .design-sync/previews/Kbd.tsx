import { Kbd, CMD_ENTER, CMD_K, CMD_S, ALT_SHIFT_E } from 'react-os-shell';

// Kbd — the badge the shortcut constants are shown in. It renders the string
// it is handed; which symbol a platform uses is what the constants decide.

export function Rungs() {
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Kbd keys={CMD_S} />
        <Kbd keys={CMD_K} />
        <Kbd keys={CMD_ENTER} />
        <Kbd keys="Esc" />
      </div>
      <div className="flex items-center gap-2">
        <Kbd keys={CMD_S} size="sm" />
        <Kbd keys={CMD_K} size="sm" />
        <Kbd keys={ALT_SHIFT_E} size="sm" />
      </div>
    </div>
  );
}

// Where it actually lives: inside the control it belongs to. `sm` is the quiet
// badge on a secondary action, `md` the one beside a primary button.
export function InControls() {
  return (
    <div className="flex flex-wrap items-center gap-3 p-5">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm"
      >
        Save <Kbd keys={CMD_ENTER} className="border-gray-100" />
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm"
      >
        Edit <Kbd keys={ALT_SHIFT_E} size="sm" />
      </button>
    </div>
  );
}

// In a cheatsheet row, where the badge is the subject rather than an adornment.
export function Cheatsheet() {
  const rows = [
    { keys: CMD_K, what: 'Search everything' },
    { keys: CMD_S, what: 'Save the open record' },
    { keys: CMD_ENTER, what: 'Submit the form' },
    { keys: ALT_SHIFT_E, what: 'Edit the record in view' },
  ];
  return (
    <div className="max-w-sm p-5">
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {rows.map(r => (
          <div key={r.what} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span className="text-sm text-gray-700">{r.what}</span>
            <Kbd keys={r.keys} />
          </div>
        ))}
      </div>
    </div>
  );
}
