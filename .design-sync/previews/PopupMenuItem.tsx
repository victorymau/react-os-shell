import { PopupMenu, PopupMenuItem, PopupMenuDivider, PopupMenuLabel } from 'react-os-shell';

const noop = () => {};

// PopupMenuItem — a single clickable row inside a PopupMenu. Supports a `danger`
// variant (red, for destructive actions) and a `disabled` state. Shown across
// all three states in a realistic context menu.
export function ItemStates() {
  return (
    <div className="p-6 flex justify-center">
      <PopupMenu minWidth={210}>
        <PopupMenuLabel>Row actions</PopupMenuLabel>
        <PopupMenuItem onClick={noop}>Open</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Duplicate</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Export…</PopupMenuItem>
        <PopupMenuDivider />
        <PopupMenuItem onClick={noop} disabled>Merge (select 2+)</PopupMenuItem>
        <PopupMenuItem onClick={noop} danger>Delete record</PopupMenuItem>
      </PopupMenu>
    </div>
  );
}

// A plainer menu of default items only.
export function PlainItems() {
  return (
    <div className="p-6 flex justify-center">
      <PopupMenu minWidth={180}>
        <PopupMenuItem onClick={noop}>View profile</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Account settings</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Keyboard shortcuts</PopupMenuItem>
      </PopupMenu>
    </div>
  );
}
