/**
 * Floating "Dev Toolbox" panel for testing the in-app dialog/notification
 * primitives. Toggle with Alt+Shift+T. Each button fires one of the
 * primitives so we can visually QA them without setting up a real flow.
 *
 * Demo-only — not part of the library bundle.
 */
import { useEffect, useState } from 'react';
import { toast, confirm, confirmDestructive, prompt } from 'react-os-shell';

interface DevToolboxProps {
  pushNotification: (title: string, message?: string) => void;
}

export default function DevToolbox({ pushNotification }: DevToolboxProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  const btn = 'w-full text-left px-3 py-1.5 text-xs rounded hover:bg-gray-100 text-gray-700 border border-gray-200 bg-white';

  return (
    <div className="fixed top-20 right-4 z-[10000] w-72 bg-white border border-gray-300 rounded-lg shadow-2xl">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div>
          <div className="text-sm font-semibold text-gray-800">Dev Toolbox</div>
          <div className="text-[10px] text-gray-400">Alt+Shift+T to toggle</div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-gray-700 px-1"
          title="Close"
        >✕</button>
      </div>
      <div className="p-2 space-y-1.5">
        <button onClick={() => toast.success('Saved successfully.')} className={btn}>
          toast.success
        </button>
        <button onClick={() => toast.error('Network request failed.')} className={btn}>
          toast.error
        </button>
        <button
          onClick={() => pushNotification('Alex commented', 'Replied on the design doc you shared.')}
          className={btn}
        >
          push notification
        </button>
        <button
          onClick={async () => {
            const ok = await confirm({
              title: 'Save changes?',
              message: 'Your changes will be uploaded to the server.',
              confirmLabel: 'Save',
            });
            toast.success(ok ? 'Confirmed' : 'Cancelled');
          }}
          className={btn}
        >
          confirm
        </button>
        <button
          onClick={async () => {
            const ok = await confirmDestructive({
              title: 'Delete project',
              message: 'This action cannot be undone. All files in this project will be permanently removed.',
              confirmWord: 'DELETE',
            });
            toast.success(ok ? 'Project deleted' : 'Cancelled');
          }}
          className={btn}
        >
          confirmDestructive
        </button>
        <button
          onClick={async () => {
            const v = await prompt({
              title: 'New project',
              message: 'Pick a name for your project.',
              placeholder: 'My great idea',
              confirmLabel: 'Create',
            });
            toast.success(v ? `Created: ${v}` : 'Cancelled');
          }}
          className={btn}
        >
          prompt
        </button>
      </div>
    </div>
  );
}
