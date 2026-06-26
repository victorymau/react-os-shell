import { PopupMenu, PopupMenuItem, PopupMenuDivider, PopupMenuLabel } from 'react-os-shell';

const noop = () => {};

// PopupMenuDivider — a thin horizontal rule that separates groups of items
// inside a PopupMenu. Here two dividers carve the menu into three logical
// sections (navigate / edit / destructive).
export function DividedSections() {
  return (
    <div className="p-6 flex justify-center">
      <PopupMenu minWidth={210}>
        <PopupMenuItem onClick={noop}>Open in new window</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Reveal in list</PopupMenuItem>
        <PopupMenuDivider />
        <PopupMenuItem onClick={noop}>Rename</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Duplicate</PopupMenuItem>
        <PopupMenuDivider />
        <PopupMenuItem onClick={noop} danger>Delete</PopupMenuItem>
      </PopupMenu>
    </div>
  );
}

// One divider isolating a destructive action from the rest.
export function IsolateDanger() {
  return (
    <div className="p-6 flex justify-center">
      <PopupMenu minWidth={190}>
        <PopupMenuLabel>File</PopupMenuLabel>
        <PopupMenuItem onClick={noop}>Save</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Export…</PopupMenuItem>
        <PopupMenuDivider />
        <PopupMenuItem onClick={noop} danger>Discard draft</PopupMenuItem>
      </PopupMenu>
    </div>
  );
}
