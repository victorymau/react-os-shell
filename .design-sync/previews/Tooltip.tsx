import { Tooltip, Button } from 'react-os-shell';

// Tooltip — a frosted hover/focus bubble around its trigger. In a static
// preview only the trigger shows (the bubble appears on hover), like ShortcutHelp.

export function Triggers() {
  return (
    <div className="flex items-center gap-3 p-8">
      <Tooltip content="Saves to the cloud"><Button variant="secondary" size="sm">Hover me</Button></Tooltip>
      <Tooltip content="Delete permanently" side="bottom"><Button variant="ghost" size="sm">Delete</Button></Tooltip>
    </div>
  );
}
