import { CancelButton } from 'react-os-shell';

const noop = () => {};

// CancelButton — the secondary action in a modal footer. Standalone it renders
// a neutral "Cancel" button; inside a Modal it also guards against discarding
// unsaved edits. Shown here in a mock dialog footer next to a primary action.
export function InFooter() {
  return (
    <div className="p-5">
      <div className="max-w-md rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-gray-900">Edit supplier</h3>
          <p className="mt-1 text-sm text-gray-500">
            Update the contact details for this supplier record.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <CancelButton onClick={noop} />
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// Custom label via children.
export function CustomLabel() {
  return (
    <div className="p-5 flex items-center gap-3">
      <CancelButton onClick={noop} />
      <CancelButton onClick={noop}>Discard</CancelButton>
      <CancelButton onClick={noop}>Go back</CancelButton>
    </div>
  );
}
