import { Button } from 'react-os-shell';

// Button — variants (primary follows the active accent), sizes, loading and
// icon states. Controlled like a native button.

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2 p-5">
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Delete</Button>
    </div>
  );
}

export function SizesAndStates() {
  return (
    <div className="flex flex-wrap items-center gap-2 p-5">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button loading>Saving…</Button>
      <Button disabled>Disabled</Button>
      <Button leftIcon={<span aria-hidden>＋</span>}>New item</Button>
    </div>
  );
}
