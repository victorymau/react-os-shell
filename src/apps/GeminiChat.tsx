import { useState, useRef, useEffect } from 'react';
import useGoogleAuth, { getGoogleAccessToken } from '../hooks/useGoogleAuth';
import toast from '../shell/toast';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export default function GeminiChat() {
  const { isConnected, user, connect, disconnect, hasClientId, setClientId, loading: authLoading, error: authError } = useGoogleAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const token = getGoogleAccessToken();
    if (!token) { toast.error('Google session expired. Please reconnect.'); return; }

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Build conversation history for context
      const contents = [...messages, userMsg].map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const res = await fetch(`${GEMINI_API}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contents }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error ${res.status}`);
      }

      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
      setMessages(prev => [...prev, { role: 'model', content: reply, timestamp: new Date() }]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to get response from Gemini.');
      setMessages(prev => [...prev, { role: 'model', content: `Error: ${err.message}`, timestamp: new Date() }]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const clearChat = () => {
    setMessages([]);
  };

  // ── Not connected ──
  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md space-y-4 px-6">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Gemini AI</h2>
          <p className="text-sm text-gray-500">Connect your Google account to chat with Gemini AI.</p>

          {!hasClientId ? (
            <div className="text-left space-y-2 bg-gray-50 rounded-lg p-4">
              <label className="block text-xs font-medium text-gray-700">Google OAuth Client ID</label>
              <input value={clientIdInput} onChange={e => setClientIdInput(e.target.value)} placeholder="123456789.apps.googleusercontent.com"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
              <button onClick={() => { if (clientIdInput.trim()) setClientId(clientIdInput.trim()); }} disabled={!clientIdInput.trim()}
                className="w-full bg-gray-900 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-40">Save Client ID</button>
              <p className="text-[10px] text-gray-400">Enable "Generative Language API" in your Google Cloud project</p>
            </div>
          ) : (
            <button onClick={connect} disabled={authLoading}
              className="inline-flex items-center gap-2 bg-white border border-gray-300 shadow-sm px-6 py-2.5 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              {authLoading ? 'Connecting...' : 'Sign in with Google'}
            </button>
          )}
          {authError && <p className="text-sm text-red-600">{authError}</p>}
        </div>
      </div>
    );
  }

  // ── Connected: Chat UI ──
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center">
            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
          </div>
          <span className="text-sm font-semibold text-gray-900">Gemini</span>
          <span className="text-xs text-gray-400">2.5 Flash</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clearChat} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
          <button onClick={() => window.dispatchEvent(new Event('open-google-connect'))} title="Google Services"
            className="flex items-center gap-2 hover:bg-gray-100 rounded-md px-1.5 py-1 transition-colors">
            {user?.picture ? (
              <img src={user.picture} alt="" className="h-6 w-6 rounded-full" />
            ) : (
              <div className="h-6 w-6 rounded-full bg-gray-200" />
            )}
            <div className="text-left">
              <p className="text-[11px] font-medium text-gray-900">{user?.name}</p>
              <p className="text-[10px] text-gray-500">{user?.email}</p>
            </div>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <div className="h-12 w-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 flex items-center justify-center">
                <svg className="h-6 w-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              </div>
              <p className="text-sm text-gray-500">Ask Gemini anything</p>
              <p className="text-xs text-gray-400 mt-1">Powered by Google AI</p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
              <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                {msg.timestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Message Gemini..."
            rows={1}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm resize-none focus:border-blue-500 focus:ring-blue-500 max-h-32"
            style={{ minHeight: '42px' }}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}
            className="shrink-0 bg-blue-600 text-white rounded-xl p-2.5 hover:bg-blue-700 disabled:opacity-40 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
