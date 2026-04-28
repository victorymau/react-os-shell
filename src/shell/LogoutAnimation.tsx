import { useEffect, useState } from 'react';
import { playLogout } from '../utils/sounds';

export default function LogoutAnimation({ onComplete, subtitle }: { onComplete: () => void; subtitle?: string }) {
  const [phase, setPhase] = useState<'show' | 'shrink' | 'fade'>('show');

  useEffect(() => {
    playLogout();
    const t1 = setTimeout(() => setPhase('shrink'), 800);
    const t2 = setTimeout(() => setPhase('fade'), 1800);
    const t3 = setTimeout(onComplete, 2300);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-500 ${phase === 'fade' ? 'opacity-0' : 'opacity-100'}`}
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}
    >
      {/* Glow effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 70%)',
            animation: 'logout-glow 2s ease-in-out infinite',
            opacity: phase === 'shrink' ? 0 : 0.2,
            transition: 'opacity 1s',
          }} />
      </div>

      {/* Logo — spins out */}
      <div className={`relative transition-all duration-1000 ease-in ${phase === 'shrink' ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
        style={phase === 'shrink' ? { transform: 'scale(0) rotate(180deg)' } : undefined}>
        <img src="/favicon.svg" alt="" className="h-20 w-20 drop-shadow-[0_0_30px_rgba(124,58,237,0.5)]" />
      </div>

      {/* Title — fades down */}
      <div className={`mt-6 text-center transition-all duration-700 ${phase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <h1 className="text-2xl font-bold tracking-[0.3em] text-white/90 uppercase">Goodbye</h1>
        <p className="mt-2 text-xs text-white/40">See you next time</p>
      </div>

      {/* Subtitle (consumer-supplied — typically the company / product name) */}
      {subtitle && (
        <div className={`absolute bottom-8 transition-all duration-500 ${phase === 'show' ? 'opacity-40' : 'opacity-0'}`}>
          <p className="text-[10px] text-white/40 font-mono tracking-wider">{subtitle}</p>
        </div>
      )}

      <style>{`
        @keyframes logout-glow {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.15; }
          50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.25; }
        }
      `}</style>
    </div>
  );
}
