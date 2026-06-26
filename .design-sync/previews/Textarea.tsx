import { Textarea } from 'react-os-shell';

// Textarea — multi-line field matching the Input look. Forwards native props;
// `autoGrow` resizes to content.

export function States() {
  return (
    <div className="max-w-md space-y-3 p-5">
      <Textarea defaultValue="Product designer at Acme. Loves crisp UI." rows={3} />
      <Textarea placeholder="Write a message…" />
      <Textarea invalid defaultValue="Too short" rows={2} />
    </div>
  );
}
