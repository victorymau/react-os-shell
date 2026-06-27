import { ColoredBadge } from 'react-os-shell';

// ColoredBadge — a rounded-full pill whose colors come from a Tailwind class
// string. Generic counterpart to StatusBadge (use it when the caller already
// knows the color). Sizes: xs (dense cells), sm (default), md.

const SWATCHES: { label: string; colorClass: string }[] = [
  { label: 'Paid', colorClass: 'bg-green-100 text-green-800' },
  { label: 'Pending', colorClass: 'bg-amber-100 text-amber-800' },
  { label: 'Overdue', colorClass: 'bg-red-100 text-red-800' },
  { label: 'Draft', colorClass: 'bg-gray-100 text-gray-700' },
  { label: 'In Review', colorClass: 'bg-blue-100 text-blue-800' },
];

export function Colors() {
  return (
    <div className="p-5 flex flex-wrap gap-2">
      {SWATCHES.map(s => (
        <ColoredBadge key={s.label} colorClass={s.colorClass}>{s.label}</ColoredBadge>
      ))}
    </div>
  );
}

export function Sizes() {
  return (
    <div className="p-5 flex items-center gap-3">
      <ColoredBadge colorClass="bg-blue-100 text-blue-800" size="xs">xs</ColoredBadge>
      <ColoredBadge colorClass="bg-blue-100 text-blue-800" size="sm">sm</ColoredBadge>
      <ColoredBadge colorClass="bg-blue-100 text-blue-800" size="md">md</ColoredBadge>
    </div>
  );
}

export function FromRawStatus() {
  return (
    <div className="p-5 flex flex-wrap gap-2">
      <ColoredBadge colorClass="bg-green-100 text-green-800" capitalize>in_production</ColoredBadge>
      <ColoredBadge colorClass="bg-amber-100 text-amber-800" capitalize>partially_paid</ColoredBadge>
    </div>
  );
}
