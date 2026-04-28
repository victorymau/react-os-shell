/**
 * Google OAuth2 hook for Gmail, Calendar, and Gemini access.
 *
 * Uses Google Identity Services (GIS) to get an access token with combined scopes.
 * Requires a Google Cloud OAuth2 Client ID configured in System Settings.
 *
 * Scopes requested:
 *  - Gmail: read, compose, send, modify
 *  - Calendar: read, write events
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

  const handleTokenResponse = useCallback((response: any) => {
    if (response.error) {
      setError(response.error);
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
    fetchUserInfo(token);
  }, [fetchUserInfo]);

  // Initialize GIS client
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
    }).catch(err => setError(err.message));
  }, [clientId, handleTokenResponse]);

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
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      // Revoke token
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
  }, []);

  // Check token expiry periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (accessToken && !isTokenValid()) {
        setAccessToken(null);
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
