import { LoadingSpinner } from 'react-os-shell';

// LoadingSpinner — centered animated ring for pending regions. Sizes sm / md / lg.

export function Sizes() {
  return (
    <div className="p-5 flex items-center justify-around">
      <LoadingSpinner size="sm" padding="" />
      <LoadingSpinner size="md" padding="" />
      <LoadingSpinner size="lg" padding="" />
    </div>
  );
}

export function InPanel() {
  return (
    <div className="p-5">
      <div className="rounded-lg border border-gray-200">
        <LoadingSpinner />
      </div>
    </div>
  );
}
