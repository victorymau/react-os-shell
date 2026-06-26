import { Modal } from 'react-os-shell';

// Modal is the shell's draggable window/dialog. Open, with a title bar (icon,
// minimize/maximize/close), a body, and footer actions. Rendered open so the
// window chrome is visible in the card.
const noop = () => {};

export function Dialog() {
  return (
    <Modal
      open
      onClose={noop}
      title="Edit profile"
      size="md"
      actions={
        <>
          <button className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          <button className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Save changes</button>
        </>
      }
    >
      <div className="space-y-4 p-1 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium text-gray-700">Display name</span>
          <input defaultValue="Victor Mau" className="w-full rounded-md border border-gray-300 px-3 py-1.5" />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium text-gray-700">Email</span>
          <input defaultValue="victor@regis.design" className="w-full rounded-md border border-gray-300 px-3 py-1.5" />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium text-gray-700">Bio</span>
          <textarea defaultValue="Designer & builder of desktop-style web apps." rows={3} className="w-full rounded-md border border-gray-300 px-3 py-1.5" />
        </label>
      </div>
    </Modal>
  );
}
