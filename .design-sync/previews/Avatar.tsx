import { Avatar } from 'react-os-shell';

// Avatar — circular image with initials fallback, sizes, and a status dot.

export function SizesAndStatus() {
  return (
    <div className="flex items-center gap-4 p-5">
      <Avatar size="xs" name="Alice Nguyen" />
      <Avatar size="sm" name="Marco Reyes" status="online" />
      <Avatar size="md" name="Priya Patel" status="busy" />
      <Avatar size="lg" name="Tom Becker" status="away" />
    </div>
  );
}
