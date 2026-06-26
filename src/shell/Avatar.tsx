/**
 * Avatar — a circular user image with an initials fallback and an optional
 * status dot. AvatarGroup overlaps several into a stack with a "+N" overflow
 * chip. Sizes are applied via inline `style` (fixed px) so they don't depend
 * on arbitrary Tailwind classes.
 */
import { Children, type ReactNode } from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';
export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away';

const SIZE_PX: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 40, lg: 56 };
const STATUS_COLOR: Record<AvatarStatus, string> = {
  online: 'bg-green-500',
  offline: 'bg-gray-400',
  busy: 'bg-red-500',
  away: 'bg-amber-500',
};

export interface AvatarProps {
  src?: string;
  /** Used for the initials fallback and the image alt text. */
  name?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
  className?: string;
}

function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

export default function Avatar({ src, name, size = 'md', status, className = '' }: AvatarProps) {
  const px = SIZE_PX[size];
  const dot = Math.max(8, Math.round(px * 0.28));
  return (
    <span className={`relative inline-flex shrink-0 ${className}`.trim()} style={{ width: px, height: px }}>
      {src ? (
        <img src={src} alt={name ?? ''} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full bg-gray-100 font-medium text-gray-600"
          style={{ fontSize: Math.round(px * 0.4) }}
        >
          {initials(name)}
        </span>
      )}
      {status && (
        <span
          className={`absolute bottom-0 right-0 rounded-full ring-2 ring-white ${STATUS_COLOR[status]}`}
          style={{ width: dot, height: dot }}
        />
      )}
    </span>
  );
}

export interface AvatarGroupProps {
  children: ReactNode;
  /** Show at most this many avatars; the rest collapse into a +N chip. */
  max?: number;
  /** Size of the children — used for the overlap + overflow-chip geometry.
   *  Give the child Avatars this same size. */
  size?: AvatarSize;
  className?: string;
}

export function AvatarGroup({ children, max, size = 'md', className = '' }: AvatarGroupProps) {
  const items = Children.toArray(children);
  const shown = max ? items.slice(0, max) : items;
  const overflow = max ? items.length - shown.length : 0;
  const px = SIZE_PX[size];
  const overlap = Math.round(px * 0.3);
  return (
    <div className={`flex items-center ${className}`.trim()}>
      {shown.map((child, i) => (
        <span key={i} className="rounded-full ring-2 ring-white" style={{ marginLeft: i === 0 ? 0 : -overlap }}>
          {child}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="flex items-center justify-center rounded-full bg-gray-200 font-medium text-gray-600 ring-2 ring-white"
          style={{ width: px, height: px, marginLeft: -overlap, fontSize: Math.round(px * 0.36) }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
