import { PopupMenu, PopupMenuItem, PopupMenuDivider, PopupMenuLabel } from 'react-os-shell';

// PopupMenu is the shell's frosted-glass context menu. Rendered in place
// (portal off) so the open menu paints inside the card. Items can carry a
// `danger` tone and a `disabled` state; labels and dividers section the list.
const noop = () => {};

export function ContextMenu() {
  return (
    <div className="p-6 flex justify-center">
      <PopupMenu minWidth={200}>
        <PopupMenuLabel>Edit</PopupMenuLabel>
        <PopupMenuItem onClick={noop}>Cut</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Copy</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Paste</PopupMenuItem>
        <PopupMenuDivider />
        <PopupMenuLabel>Arrange</PopupMenuLabel>
        <PopupMenuItem onClick={noop}>Bring to front</PopupMenuItem>
        <PopupMenuItem onClick={noop} disabled>Send to back</PopupMenuItem>
        <PopupMenuDivider />
        <PopupMenuItem onClick={noop} danger>Delete</PopupMenuItem>
      </PopupMenu>
    </div>
  );
}

export function ImageWidthMenu() {
  return (
    <div className="p-6 flex justify-center">
      <PopupMenu minWidth={180}>
        <PopupMenuLabel>Image width</PopupMenuLabel>
        <PopupMenuItem onClick={noop}>Small</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Medium</PopupMenuItem>
        <PopupMenuItem onClick={noop}>Full width</PopupMenuItem>
        <PopupMenuDivider />
        <PopupMenuItem onClick={noop} danger>Remove image</PopupMenuItem>
      </PopupMenu>
    </div>
  );
}
