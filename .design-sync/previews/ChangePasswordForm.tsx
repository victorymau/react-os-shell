import { ChangePasswordForm } from 'react-os-shell';

// ChangePasswordForm — current / new / confirm fields with client validation,
// inline errors, and submit state. The host wires onSubmit (API + re-login);
// here it's a no-op so the empty form renders.

export function Form() {
  return (
    <div className="p-5 max-w-md">
      <ChangePasswordForm onSubmit={async () => {}} />
    </div>
  );
}
