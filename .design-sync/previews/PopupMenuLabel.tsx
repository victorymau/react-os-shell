import { PopupMenu, PopupMenuItem, PopupMenuDivider, PopupMenuLabel } from 'react-os-shell';

const noop = () => {};

// PopupMenuLabel — a non-interactive section heading inside a PopupMenu, used to
// title a group of items. Here two labels split the menu into clearly named
// sections.
export function SectionedMenu() {
  return (
    <div className="p-6 flex justify-center">
      <PopupMenu minWidth={210}>
        <PopupMenuLabel>Edit</PopupMenuLabel>
        <PopupMenuItem onClick={noop}>Cut</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Copy</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Paste</PopupMenuItem>
        <PopupMenuDivider />
        <PopupMenuLabel>Arrange</PopupMenuLabel>
        <PopupMenuItem onClick={noop}>Bring to front</PopupMenuItem>
        <PopupMenuItem onClick={noop} disabled>Send to back</PopupMenuItem>
      </PopupMenu>
    </div>
  );
}

// A single label heading a short menu.
export function LabeledMenu() {
  return (
    <div className="p-6 flex justify-center">
      <PopupMenu minWidth={190}>
        <PopupMenuLabel>Signed in as victor</PopupMenuLabel>
        <PopupMenuItem onClick={noop}>Profile</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Settings</PopupMenuItem>
        <PopupMenuItem onClick={noop} danger>Sign out</PopupMenuItem>
      </PopupMenu>
    </div>
  );
}
