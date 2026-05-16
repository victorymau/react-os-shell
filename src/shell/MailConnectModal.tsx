import { useEffect, useState } from 'react';
import useMailAuth, { type LoginPayload } from '../hooks/useMailAuth';
import Modal, { ModalActions } from './Modal';

interface ProviderPreset {
  id: string;
  label: string;
  note?: string;
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  caldav?: string;
}

const PRESETS: ProviderPreset[] = [
  {
    id: 'fastmail',
    label: 'Fastmail',
    imap: { host: 'imap.fastmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.fastmail.com', port: 465, secure: true },
    caldav: 'https://caldav.fastmail.com/',
  },
  {
    id: 'icloud',
    label: 'iCloud',
    note: 'Requires an app-specific password (appleid.apple.com).',
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    caldav: 'https://caldav.icloud.com/',
  },
  {
    id: 'yahoo',
    label: 'Yahoo',
    note: 'Requires an app password (account.yahoo.com).',
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    caldav: 'https://caldav.calendar.yahoo.com/',
  },
  {
    id: 'gmail',
    label: 'Gmail (app password required)',
    note: 'Enable 2FA and create an app password — Gmail rejects regular passwords for IMAP.',
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  },
  {
    id: 'outlook',
    label: 'Outlook (app password required)',
    note: 'Modern auth not supported — generate an app password in Microsoft account settings.',
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
  },
  {
    id: 'custom',
    label: 'Custom',
    imap: { host: '', port: 993, secure: true },
    smtp: { host: '', port: 465, secure: true },
  },
];

export default function MailConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isConnected, user, capabilities, login, logout, loading, error } = useMailAuth();
  const [presetId, setPresetId] = useState<string>('fastmail');
  const preset = PRESETS.find(p => p.id === presetId) || PRESETS[0];
  const prefill = typeof window !== 'undefined' ? localStorage.getItem('mail_login_prefill_email') || '' : '';

  const [email, setEmail] = useState(prefill);
  const [password, setPassword] = useState('');
  const [imapHost, setImapHost] = useState(preset.imap.host);
  const [imapPort, setImapPort] = useState(preset.imap.port);
  const [imapSecure, setImapSecure] = useState(preset.imap.secure);
  const [smtpHost, setSmtpHost] = useState(preset.smtp.host);
  const [smtpPort, setSmtpPort] = useState(preset.smtp.port);
  const [smtpSecure, setSmtpSecure] = useState(preset.smtp.secure);
  const [caldavUrl, setCaldavUrl] = useState(preset.caldav || '');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setImapHost(preset.imap.host);
    setImapPort(preset.imap.port);
    setImapSecure(preset.imap.secure);
    setSmtpHost(preset.smtp.host);
    setSmtpPort(preset.smtp.port);
    setSmtpSecure(preset.smtp.secure);
    setCaldavUrl(preset.caldav || '');
  }, [preset]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!email || !password) {
      setLocalError('Email and password are required');
      return;
    }
    const payload: LoginPayload = {
      imap: { host: imapHost, port: imapPort, secure: imapSecure, user: email, pass: password },
      smtp: { host: smtpHost, port: smtpPort, secure: smtpSecure, user: email, pass: password },
      caldav: caldavUrl ? { serverUrl: caldavUrl, user: email, pass: password } : undefined,
    };
    try {
      await login(payload);
      onClose();
    } catch {
      // error surfaced via hook state
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Mail & Calendar" size="md">
      {isConnected ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-900">Connected as {user?.email}</p>
            <p className="text-xs text-green-700 mt-1">
              IMAP: ok · SMTP: ok · CalDAV: {capabilities?.caldav ? 'ok' : 'not configured'}
            </p>
          </div>
          <p className="text-xs text-gray-500">
            Disconnect to switch accounts. Credentials are not persisted to disk — restarting the bridge server signs you out.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="block text-xs font-medium text-gray-700 mb-1">Provider</span>
            <select
              value={presetId}
              onChange={e => setPresetId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {PRESETS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>

          {preset.note && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{preset.note}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-2">
              <span className="block text-xs font-medium text-gray-700 mb-1">Email</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="username"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block col-span-2">
              <span className="block text-xs font-medium text-gray-700 mb-1">Password</span>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <fieldset className="border border-gray-200 rounded-md p-3">
            <legend className="px-1 text-xs font-medium text-gray-600">IMAP (incoming)</legend>
            <div className="grid grid-cols-3 gap-2">
              <label className="block col-span-2">
                <span className="block text-[11px] text-gray-600 mb-1">Host</span>
                <input value={imapHost} onChange={e => setImapHost(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
              </label>
              <label className="block">
                <span className="block text-[11px] text-gray-600 mb-1">Port</span>
                <input type="number" value={imapPort} onChange={e => setImapPort(Number(e.target.value))} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
              </label>
              <label className="col-span-3 flex items-center gap-2 text-xs text-gray-600 mt-1">
                <input type="checkbox" checked={imapSecure} onChange={e => setImapSecure(e.target.checked)} />
                Use TLS/SSL (recommended for port 993)
              </label>
            </div>
          </fieldset>

          <fieldset className="border border-gray-200 rounded-md p-3">
            <legend className="px-1 text-xs font-medium text-gray-600">SMTP (outgoing)</legend>
            <div className="grid grid-cols-3 gap-2">
              <label className="block col-span-2">
                <span className="block text-[11px] text-gray-600 mb-1">Host</span>
                <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
              </label>
              <label className="block">
                <span className="block text-[11px] text-gray-600 mb-1">Port</span>
                <input type="number" value={smtpPort} onChange={e => setSmtpPort(Number(e.target.value))} className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
              </label>
              <label className="col-span-3 flex items-center gap-2 text-xs text-gray-600 mt-1">
                <input type="checkbox" checked={smtpSecure} onChange={e => setSmtpSecure(e.target.checked)} />
                Use TLS/SSL (recommended for port 465)
              </label>
            </div>
          </fieldset>

          <fieldset className="border border-gray-200 rounded-md p-3">
            <legend className="px-1 text-xs font-medium text-gray-600">CalDAV (optional)</legend>
            <label className="block">
              <span className="block text-[11px] text-gray-600 mb-1">Server URL</span>
              <input
                type="url"
                value={caldavUrl}
                onChange={e => setCaldavUrl(e.target.value)}
                placeholder="https://caldav.example.com/"
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <p className="text-[10px] text-gray-500 mt-1">Leave blank to skip calendar setup.</p>
          </fieldset>

          {(localError || error) && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{localError || error}</p>
          )}
        </form>
      )}

      <ModalActions>
        {isConnected ? (
          <button
            onClick={logout}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-red-600 border border-red-200 bg-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
          >
            {loading ? 'Disconnecting…' : 'Disconnect'}
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-gray-900 text-white px-5 py-2 text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </ModalActions>
    </Modal>
  );
}
