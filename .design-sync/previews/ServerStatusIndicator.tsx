import { ServerStatusIndicator } from 'react-os-shell';

// ServerStatusIndicator — a taskbar-tray health badge (green when the backend
// responds) with a click popover showing latency + the signed-in user. The
// health poll and user are injected by the host. Shown here in a tray-like
// strip; the popover opens on click.

export function TrayBadge() {
  return (
    <div className="p-5">
      <div className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5">
        <span className="text-xs text-gray-500">Tray</span>
        <ServerStatusIndicator
          version="4.0.1"
          user={{ name: 'Victor Mau', email: 'victor@regis.design', role: 'Administrator' }}
          healthCheck={async () => ({ ok: true, latencyMs: 24 })}
        />
      </div>
    </div>
  );
}
