import { useState, useEffect, useRef } from 'react';

/**
 * Startup splash animation — shown once when the app first loads after login.
 * Fades out after the animation completes, then unmounts.
 */
export default function StartupAnimation({ onComplete, ready = false, productName = 'react-os-shell', subtitle }: { onComplete: () => void; ready?: boolean; productName?: string; subtitle?: string }) {
  const [phase, setPhase] = useState<'logo' | 'text' | 'fade'>('logo');
  const [minTimePassed, setMinTimePassed] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const fadingRef = useRef(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('text'), 600);
    const t2 = setTimeout(() => setMinTimePassed(true), 2000);
    // Safety: force complete after 5s even if ready never fires
    const t3 = setTimeout(() => {
      if (!fadingRef.current) { fadingRef.current = true; setPhase('fade'); setTimeout(() => onCompleteRef.current(), 500); }
    }, 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // Fade out when both ready AND minimum time passed
  useEffect(() => {
    if (!ready || !minTimePassed || fadingRef.current) return;
    fadingRef.current = true;
    setPhase('fade');
    const t = setTimeout(() => onCompleteRef.current(), 500);
    return () => clearTimeout(t);
  }, [ready, minTimePassed]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-500 ${phase === 'fade' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
    >
      {/* Glow effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 70%)', animation: 'pulse-glow 2s ease-in-out infinite' }} />
      </div>

      {/* Logo */}
      <div className={`relative transition-all duration-700 ease-out ${phase === 'logo' ? 'scale-75 opacity-0' : 'scale-100 opacity-100'}`}>
        <img src="/favicon.svg" alt="" className="h-20 w-20 drop-shadow-[0_0_30px_rgba(124,58,237,0.5)]"
          style={{ animation: 'spin-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }} />
      </div>

      {/* Title */}
      <div className={`mt-6 text-center transition-all duration-500 ${phase !== 'logo' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <h1 className="text-2xl font-bold tracking-[0.3em] text-white/90 uppercase">{productName}</h1>
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-purple-400"
              style={{ animation: `dot-bounce 1s ease-in-out ${i * 0.15}s infinite` }} />
          ))}
        </div>
      </div>

      {/* Subtitle (consumer-supplied — typically the company / product name) */}
      {subtitle && (
        <div className={`absolute bottom-8 transition-all duration-500 ${phase !== 'logo' ? 'opacity-40' : 'opacity-0'}`}>
          <p className="text-[10px] text-white/40 font-mono tracking-wider">{subtitle}</p>
        </div>
      )}

      <style>{`
        @keyframes spin-in {
          0% { transform: scale(0) rotate(-180deg); opacity: 0; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes pulse-glow {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.15; }
          50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.25; }
        }
      `}</style>
    </div>
  );
}
