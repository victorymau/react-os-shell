/**
 * ChangePasswordForm — a self-contained "change my password" form: three
 * password fields (current / new / confirm), client-side validation, inline
 * error display, and submit/loading state. It owns all of that, but stays
 * product-agnostic: it knows nothing about how a password is actually changed.
 *
 * The host injects that via `onSubmit(oldPassword, newPassword)`, which it runs
 * on a valid submit. If `onSubmit` rejects, its `Error.message` is shown inline
 * (so a wrapper can surface a field-specific API message there). On success the
 * form shows a confirmation screen with a Done button (the original admin
 * behaviour) and fires `onSuccess` when Done is clicked. Set
 * `confirmOnSuccess={false}` to skip the screen and call `onSuccess`
 * immediately instead (the customer/supplier behaviour).
 */
import { useState, type FormEvent } from 'react';
import FormField from '../forms/FormField';
import Input from '../forms/Input';
import Button from '../forms/Button';
import { CMD_ENTER } from './Kbd';

export interface ChangePasswordFormProps {
  /**
   * Perform the password change. Resolve to indicate success; reject with an
   * `Error` whose `message` becomes the inline error shown to the user.
   */
  onSubmit: (oldPassword: string, newPassword: string) => Promise<void>;
  /** Called after a successful change — on Done click, or immediately when
   *  `confirmOnSuccess` is false. */
  onSuccess?: () => void;
  /**
   * Show a success confirmation screen with a Done button after a successful
   * change. When false, `onSuccess` fires immediately on success. Default true.
   */
  confirmOnSuccess?: boolean;
  /** Minimum length required for the new password. Default 8. */
  minLength?: number;
  /** Label for the submit button. Default 'Change Password'. */
  submitLabel?: string;
  /** Label for the Done button on the success screen. Default 'Done'. */
  doneLabel?: string;
}

/**
 * Product-agnostic change-password form. The host supplies `onSubmit` to do the
 * actual change (e.g. call an API then re-authenticate).
 */
export default function ChangePasswordForm({
  onSubmit,
  onSuccess,
  confirmOnSuccess = true,
  minLength = 8,
  submitLabel = 'Change Password',
  doneLabel = 'Done',
}: ChangePasswordFormProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!oldPassword) { setError('Current password is required.'); return; }
    if (newPassword.length < minLength) { setError(`New password must be at least ${minLength} characters.`); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(oldPassword, newPassword);
      if (confirmOnSuccess) {
        setSuccess(true);
      } else {
        onSuccess?.();
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to change password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-green-50 px-4 py-3 flex items-start gap-3">
          <svg className="h-5 w-5 text-green-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium text-green-800">Your password has been changed successfully.</p>
        </div>
        <div className="flex justify-end pt-2 border-t border-gray-200">
          <Button variant="primary" onClick={() => onSuccess?.()}>{doneLabel}</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField label="Current Password" required>
        <Input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} required />
      </FormField>
      <FormField label="New Password" required>
        <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={minLength} />
      </FormField>
      <FormField label="Confirm Password" required>
        <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
      </FormField>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end pt-2 border-t border-gray-200">
        <Button type="submit" variant="primary" loading={submitting}>
          {submitting ? 'Changing...' : submitLabel}
          <kbd className="rounded border border-blue-400/50 bg-blue-500/30 px-1.5 py-0.5 text-[10px] font-medium">{CMD_ENTER}</kbd>
        </Button>
      </div>
    </form>
  );
}
