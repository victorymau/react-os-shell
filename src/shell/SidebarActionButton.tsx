import type { ReactNode } from 'react';

/**
 * Full-width action button for the `SidebarLayout` `sidebarTop` / `sidebarBottom`
 * slots — the standard list-window pattern of a primary "New X" button pinned
 * at the top and a secondary action (e.g. "Export CSV") pinned at the bottom.
 *
 * `variant="primary"` is the solid-blue create button; `"secondary"` is the
 * white outline button. Pass `hotkey` (e.g. `ALT_SHIFT_N`) to render the small
 * keyboard-hint chip the shell's `useNewHotkey` binds.
 *
 * @example
 * <SidebarLayout
 *   sidebarTop={<SidebarActionButton hotkey={ALT_SHIFT_N} onClick={onNew}>New Invoice</SidebarActionButton>}
 *   sidebar={<StatusNav />}
 * >…</SidebarLayout>
 */
export interface SidebarActionButtonProps {
  children: ReactNode;
  onClick?: () => void;
  /** Solid-blue create button (`'primary'`, default) or white outline (`'secondary'`). */
  variant?: 'primary' | 'secondary';
  /** Keyboard-hint label rendered as a trailing chip, e.g. `ALT_SHIFT_N`. */
  hotkey?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  /** Extra classes appended after the variant styles (escape hatch). */
  className?: string;
}

const VARIANTS = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
} as const;

export default function SidebarActionButton({
  children,
  onClick,
  variant = 'primary',
  hotkey,
  disabled = false,
  type = 'button',
  title,
  className = '',
}: SidebarActionButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {children}
      {hotkey && (
        <kbd className="rounded border border-blue-400/50 bg-blue-500/30 px-1.5 py-0.5 text-[10px] font-medium">
          {hotkey}
        </kbd>
      )}
    </button>
  );
}
