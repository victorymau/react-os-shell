import { useCallback, useEffect, useState } from 'react';
import { getMailClient } from '../api/mailClient';

const SESSION_FLAG = 'mail_session_known';

export interface MailUser {
  email: string;
  displayName: string;
}

export interface MailCapabilities {
  imap: { thread: boolean; condstore: boolean; idle: boolean };
  smtp: boolean;
  caldav: boolean;
}

export interface LoginPayload {
  imap: { host: string; port: number; secure: boolean; user: string; pass: string };
  smtp: { host: string; port: number; secure: boolean; user: string; pass: string };
  caldav?: { serverUrl: string; user: string; pass: string };
}

interface MailAuthState {
  loading: boolean;
  serverReachable: boolean | null;
  isConnected: boolean;
  user: MailUser | null;
  capabilities: MailCapabilities | null;
  error: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const listeners = new Set<() => void>();
let cached: { user: MailUser | null; capabilities: MailCapabilities | null; checked: boolean; serverReachable: boolean | null } = {
  user: null,
  capabilities: null,
  checked: false,
  serverReachable: null,
};

function broadcast(): void {
  listeners.forEach(fn => fn());
}

async function fetchMe(): Promise<void> {
  const client = getMailClient();
  try {
    const res = await client.get('/api/auth/me');
    cached = { user: res.data.user, capabilities: res.data.capabilities, checked: true, serverReachable: true };
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      localStorage.removeItem(SESSION_FLAG);
      cached = { user: null, capabilities: null, checked: true, serverReachable: true };
    } else {
      cached = { user: null, capabilities: null, checked: true, serverReachable: false };
    }
  }
  broadcast();
}

export default function useMailAuth(): MailAuthState {
  const [, force] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sub = () => force(n => n + 1);
    listeners.add(sub);
    if (!cached.checked && localStorage.getItem(SESSION_FLAG) === 'true') {
      fetchMe();
    } else if (!cached.checked) {
      cached.checked = true;
      cached.serverReachable = null;
      broadcast();
    }
    return () => {
      listeners.delete(sub);
    };
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    setLoading(true);
    setError(null);
    try {
      const client = getMailClient();
      const res = await client.post('/api/auth/login', payload);
      localStorage.setItem(SESSION_FLAG, 'true');
      cached = { user: res.data.user, capabilities: res.data.capabilities, checked: true, serverReachable: true };
      broadcast();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
        || (err as { message?: string })?.message
        || 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      const client = getMailClient();
      await client.post('/api/auth/logout').catch(() => undefined);
    } finally {
      localStorage.removeItem(SESSION_FLAG);
      cached = { user: null, capabilities: null, checked: true, serverReachable: cached.serverReachable };
      setLoading(false);
      broadcast();
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchMe();
  }, []);

  return {
    loading,
    serverReachable: cached.serverReachable,
    isConnected: !!cached.user,
    user: cached.user,
    capabilities: cached.capabilities,
    error,
    login,
    logout,
    refresh,
  };
}
