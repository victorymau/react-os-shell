import { useState, useRef } from 'react';
import useGoogleAuth from '../hooks/useGoogleAuth';
import Modal, { ModalActions } from './Modal';

export default function GoogleConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isConnected, user, connect, disconnect, loading, error, hasClientId, setClientId } = useGoogleAuth();
  const [clientIdInput, setClientIdInput] = useState('');
  const clientIdRef = useRef<HTMLInputElement>(null);

  return (
    <Modal open={open} onClose={onClose} title="Google Services" size="md">
      <div className="space-y-5">
        {/* Status */}
        <div className={`rounded-lg border p-4 ${isConnected ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isConnected ? 'bg-green-100' : 'bg-gray-200'}`}>
              {isConnected && user?.picture ? (
                <img src={user.picture} alt="" className="h-10 w-10 rounded-full" />
              ) : (
                <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {isConnected ? (
                <>
                  <p className="text-sm font-medium text-green-900">{user?.name || 'Connected'}</p>
                  <p className="text-xs text-green-700 truncate">{user?.email}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-900">Not connected</p>
                  <p className="text-xs text-gray-500">Sign in to access Google services</p>
                </>
              )}
            </div>
            {isConnected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Connected
              </span>
            )}
          </div>
        </div>

        {/* Services */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Available Services</h3>
          <div className="space-y-2">
            {[
              { icon: <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>, label: 'Gmail', desc: 'Read, compose, and send emails' },
              { icon: <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M19.5 3.75H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V6a2.25 2.25 0 00-2.25-2.25z" fill="none" stroke="#4285F4" strokeWidth={1.5} /><path d="M2.25 9h19.5M6.75 3.75v3m4.5-3v3m4.5-3v3" fill="none" stroke="#4285F4" strokeWidth={1.5} strokeLinecap="round" /></svg>, label: 'Calendar', desc: 'View and create calendar events' },
              { icon: <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="#8B5CF6" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>, label: 'Gemini AI', desc: 'Chat with Google AI assistant' },
            ].map(svc => (
              <div key={svc.label} className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
                <div className="shrink-0">{svc.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{svc.label}</p>
                  <p className="text-xs text-gray-500">{svc.desc}</p>
                </div>
                {isConnected && (
                  <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Client ID setup (if not configured) */}
        {!hasClientId && (
          <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-xs font-medium text-amber-800">Setup required: Google OAuth Client ID</p>
            <input
              ref={clientIdRef}
              value={clientIdInput}
              onChange={e => setClientIdInput(e.target.value)}
              onInput={e => setClientIdInput((e.target as HTMLInputElement).value)}
              placeholder="123456789.apps.googleusercontent.com"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={() => {
                const val = (clientIdRef.current?.value || clientIdInput).trim();
                if (val) { setClientId(val); setClientIdInput(val); }
              }}
              className="w-full bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800 cursor-pointer">
              Save Client ID
            </button>
            <div className="text-[10px] text-gray-500 space-y-0.5 mt-1">
              <p className="font-medium text-gray-600">Setup instructions:</p>
              <p>1. Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">console.cloud.google.com &gt; APIs &amp; Services &gt; Credentials</a></p>
              <p>2. Click <b>"+ Create Credentials"</b>, then select <b>OAuth client ID</b></p>
              <p>3. Choose <b>"Web application"</b>, name it <b>"Efficient ERP"</b>, add <b>http://erp.regis.design</b> as Authorized JavaScript origins, then click Create</p>
              <p>4. Copy your Client ID and paste it above</p>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <ModalActions>
        {isConnected ? (
          <button onClick={disconnect}
            className="inline-flex items-center gap-1.5 text-red-600 border border-red-200 bg-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-red-50">
            Disconnect
          </button>
        ) : hasClientId ? (
          <button onClick={connect} disabled={loading}
            className="inline-flex items-center gap-2 bg-white border border-gray-300 shadow-sm px-5 py-2 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {loading ? 'Connecting...' : 'Sign in with Google'}
          </button>
        ) : null}
      </ModalActions>
    </Modal>
  );
}
