/**
 * Google OAuth2 hook for Gmail, Calendar, Tasks, and Gemini access.
 *
 * Uses Google Identity Services (GIS) to get an access token with combined scopes.
 * Requires a Google Cloud OAuth2 Client ID configured in System Settings.
 *
 * Scopes requested:
 *  - Gmail: read, compose, send, modify
 *  - Calendar: read, write events
 *  - Tasks: read/write (Todo List app)
 *  - Gemini: generative language (via Vertex AI or Google AI)
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/generative-language.retriever',
].join(' ');

const TOKEN_KEY = 'google_access_token';
const TOKEN_EXPIRY_KEY = 'google_token_expiry';
const USER_KEY = 'google_user_info';
const CLIENT_ID_KEY = 'google_oauth_client_id';

interface GoogleUser {
  email: string;
  name: string;
  picture: string;
}

interface GoogleAuthState {
  isConnected: boolean;
  user: GoogleUser | null;
  accessToken: string | null;
  loading: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  getClientId: () => string;
  setClientId: (id: string) => void;
  hasClientId: boolean;
}

// Load GIS script
let gisLoaded = false;
let gisLoadPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (gisLoaded) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => { gisLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

function isTokenValid(): boolean {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!expiry) return false;
  return Date.now() < parseInt(expiry, 10) - 60000; // 1 min buffer
}

export function getGoogleAccessToken(): string | null {
  if (!isTokenValid()) return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getGoogleClientId(): string {
  return localStorage.getItem(CLIENT_ID_KEY) || '';
}

export default function useGoogleAuth(): GoogleAuthState {
  const [accessToken, setAccessToken] = useState<string | null>(() => isTokenValid() ? localStorage.getItem(TOKEN_KEY) : null);
  const [user, setUser] = useState<GoogleUser | null>(() => {
    try { const u = localStorage.getItem(USER_KEY); return u ? JSON.parse(u) : null; } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<any>(null);
  // Tracks an in-flight silent renewal so handleTokenResponse can suppress
  // its loading/error UI when the request didn't come from a user click.
  const silentInFlightRef = useRef(false);
  // setTimeout handle for the next scheduled silent renewal.
  const refreshTimerRef = useRef<number | null>(null);

  const clientId = getGoogleClientId();
  const hasClientId = !!clientId;

  const setClientId = useCallback((id: string) => {
    localStorage.setItem(CLIENT_ID_KEY, id);
    window.dispatchEvent(new Event('google-client-id-changed'));
  }, []);

  // Fetch user info from Google
  const fetchUserInfo = useCallback(async (token: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const userInfo: GoogleUser = { email: data.email, name: data.name, picture: data.picture };
        localStorage.setItem(USER_KEY, JSON.stringify(userInfo));
        setUser(userInfo);
      }
    } catch { /* ignore */ }
  }, []);

  const cancelRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // Schedule a silent refresh to fire ~60s before the current token expires.
  // Google reissues a fresh token without showing UI when the user's Google
  // session is still active and they previously granted consent.
  const scheduleSilentRefresh = useCallback(() => {
    cancelRefreshTimer();
    const expiry = parseInt(localStorage.getItem(TOKEN_EXPIRY_KEY) || '0', 10);
    if (!expiry) return;
    const delay = Math.max(0, expiry - Date.now() - 60_000);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      if (!clientRef.current) return;
      silentInFlightRef.current = true;
      try {
        clientRef.current.requestAccessToken({ prompt: '' });
      } catch {
        silentInFlightRef.current = false;
      }
    }, delay);
  }, [cancelRefreshTimer]);

  const handleTokenResponse = useCallback((response: any) => {
    const wasSilent = silentInFlightRef.current;
    silentInFlightRef.current = false;
    if (response.error) {
      if (wasSilent) {
        // Silent renewal failed (user signed out of Google, revoked access,
        // session expired, etc.). Drop the token quietly — the consumer
        // sees `isConnected = false` and the Connect button reappears.
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
        setAccessToken(null);
      } else {
        setError(response.error);
      }
      setLoading(false);
      return;
    }
    const token = response.access_token;
    const expiresIn = response.expires_in || 3600;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
    setAccessToken(token);
    setError(null);
    setLoading(false);
    if (!wasSilent) fetchUserInfo(token);
    // Chain the next silent refresh.
    scheduleSilentRefresh();
  }, [fetchUserInfo, scheduleSilentRefresh]);

  // Initialize GIS client. Once ready, schedule a silent refresh if we
  // already hold a valid token (e.g. user just reopened the tab with time
  // left on the clock) — and if the token has actually expired, request a
  // fresh one silently so they don't have to click Connect again.
  useEffect(() => {
    if (!clientId) return;
    loadGisScript().then(() => {
      const google = (window as any).google;
      if (!google?.accounts?.oauth2) return;
      clientRef.current = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: handleTokenResponse,
      });
      if (isTokenValid()) {
        scheduleSilentRefresh();
      } else if (localStorage.getItem(TOKEN_KEY)) {
        // We had a token last session but it's now expired. Try silent
        // renewal — succeeds if the Google session is still alive.
        silentInFlightRef.current = true;
        try {
          clientRef.current.requestAccessToken({ prompt: '' });
        } catch {
          silentInFlightRef.current = false;
        }
      }
    }).catch(err => setError(err.message));
    return () => cancelRefreshTimer();
  }, [clientId, handleTokenResponse, scheduleSilentRefresh, cancelRefreshTimer]);

  const connect = useCallback(() => {
    if (!clientRef.current) {
      setError('Google client not initialized. Check your Client ID.');
      return;
    }
    setLoading(true);
    setError(null);
    clientRef.current.requestAccessToken({ prompt: 'consent' });
  }, []);

  const disconnect = useCallback(() => {
    cancelRefreshTimer();
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      const google = (window as any).google;
      if (google?.accounts?.oauth2) {
        google.accounts.oauth2.revoke(token);
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(USER_KEY);
    setAccessToken(null);
    setUser(null);
  }, [cancelRefreshTimer]);

  // Belt-and-suspenders expiry check. Most expiries are caught by the
  // scheduled refresh above; this fires every 30s if the timer ever
  // misses (e.g. setTimeout drift after long sleep).
  useEffect(() => {
    const interval = setInterval(() => {
      if (accessToken && !isTokenValid()) {
        setAccessToken(null);
        // Try one silent refresh before giving up.
        if (clientRef.current && !silentInFlightRef.current) {
          silentInFlightRef.current = true;
          try { clientRef.current.requestAccessToken({ prompt: '' }); }
          catch { silentInFlightRef.current = false; }
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [accessToken]);

  return {
    isConnected: !!accessToken && isTokenValid(),
    user,
    accessToken,
    loading,
    error,
    connect,
    disconnect,
    getClientId: () => clientId,
    setClientId,
    hasClientId,
  };
}
