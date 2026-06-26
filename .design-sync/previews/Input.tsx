import { Input } from 'react-os-shell';

// Input — a styled text field. Thin wrapper over the shared form-input look;
// supports invalid state, a left icon, and a right adornment.

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="9" cy="9" r="6" /><path d="M14 14l3 3" strokeLinecap="round" />
    </svg>
  );
}

export function States() {
  return (
    <div className="max-w-md space-y-3 p-5">
      <Input defaultValue="Alice Nguyen" placeholder="Full name" />
      <Input placeholder="Search…" leftIcon={<SearchIcon />} />
      <Input defaultValue="42" rightAdornment={<span className="text-xs">kg</span>} />
      <Input invalid defaultValue="not-an-email" placeholder="Email" />
      <Input disabled defaultValue="Locked" />
    </div>
  );
}
