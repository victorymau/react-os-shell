/**
 * Two presentations:
 *
 * 1. toast.success / error / info — brief operation feedback, top-center,
 *    auto-dismiss (success/error ~3s, info ~4.5s). The everyday "what just
 *    happened" feedback — most messages want this.
 * 2. toast.notify — system notification, top-right card, stays 10s, dismissible.
 *    For an alert worth lingering on; reach for it deliberately, not by default.
 *
 * (Historically `toast.info` rendered the top-right notification card; it now
 * renders a brief toast — that persistent card moved to `toast.notify`.)
 */

const TOAST_CONTAINER_ID = 'toast-container';
const NOTIF_CONTAINER_ID = 'notif-container';
const FADE_MS = 300;

function getOrCreate(id: string, className: string): HTMLElement {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = className;
    document.body.appendChild(el);
  }
  return el;
}

function getMenuOpacity(): number {
  try {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--menu-opacity')?.trim();
    if (val) return parseFloat(val);
  } catch {}
  return 0.95;
}

function glassBackground(o: number): string {
  return `linear-gradient(135deg, rgba(255,255,255,${o * 0.85}) 0%, rgba(255,255,255,${o * 0.65}) 50%, rgba(255,255,255,${o * 0.75}) 100%)`;
}

const GLASS_COMMON = `
  backdrop-filter: blur(40px) saturate(1.8); -webkit-backdrop-filter: blur(40px) saturate(1.8);
  border: 1px solid rgba(255,255,255,0.35);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08);
`;

// ── Toast (operation feedback) — top-center, brief ──

function showToast(variant: 'success' | 'error' | 'info', message: string,
                   opts?: { duration?: number }) {
  import('../utils/sounds').then(s => {
    if (variant === 'success') s.playSuccess();
    else if (variant === 'error') s.playError();
    else s.playNotification();
  }).catch(() => {});

  const container = getOrCreate(TOAST_CONTAINER_ID, 'fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none');
  const o = getMenuOpacity();
  const color = variant === 'success' ? '#22c55e' : variant === 'error' ? '#ef4444' : '#3b82f6';
  const icons = {
    success: '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="' + color + '" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
    error: '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="' + color + '" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
    info: '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="' + color + '" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  };
  const icon = icons[variant];

  const el = document.createElement('div');
  el.className = 'pointer-events-auto';
  el.style.cssText = `
    padding: 8px 20px; border-radius: 12px;
    background: ${glassBackground(o)}; ${GLASS_COMMON}
    opacity: 0; transform: translateY(-10px) scale(0.95);
    transition: opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease;
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; font-weight: 500; color: rgb(55,65,81);
    max-width: min(90vw, 460px);
  `;
  el.innerHTML = icon;
  const span = document.createElement('span');
  span.textContent = message;
  el.appendChild(span);

  container.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0) scale(1)'; });

  // Info messages are usually a sentence ("no matches — check X"); give them a
  // beat longer to read than the terse success/error confirmations.
  const duration = opts?.duration ?? (variant === 'info' ? 4500 : 3000);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px) scale(0.95)';
    setTimeout(() => el.remove(), FADE_MS);
  }, duration);
}

// ── Notification (system alert) — top-right, stays longer ──

function showNotification(message: string, opts?: { duration?: number }) {
  import('../utils/sounds').then(s => s.playNotification()).catch(() => {});

  const container = getOrCreate(NOTIF_CONTAINER_ID, 'fixed top-4 right-4 z-[9999] flex flex-col gap-3 items-end pointer-events-none');
  const o = getMenuOpacity();

  const el = document.createElement('div');
  el.className = 'pointer-events-auto cursor-pointer';
  el.style.cssText = `
    min-width: 280px; max-width: 380px; padding: 12px 16px; border-radius: 16px;
    background: ${glassBackground(o)}; ${GLASS_COMMON}
    opacity: 0; transform: translateX(30px) scale(0.95);
    transition: opacity ${FADE_MS}ms cubic-bezier(0.4,0,0.2,1), transform ${FADE_MS}ms cubic-bezier(0.4,0,0.2,1);
    display: flex; align-items: flex-start; gap: 12px;
  `;

  el.innerHTML = `
    <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(59,130,246,0.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
      <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg>
    </div>
    <div style="flex: 1; min-width: 0;">
      <div style="font-size: 11px; font-weight: 600; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Notification</div>
      <div class="notif-msg" style="font-size: 13px; font-weight: 500; color: rgb(55,65,81); line-height: 1.4;"></div>
    </div>
    <button style="flex-shrink: 0; padding: 4px; color: rgb(156,163,175); font-size: 18px; line-height: 1; transition: color 0.2s;" onmouseenter="this.style.color='rgb(75,85,99)'" onmouseleave="this.style.color='rgb(156,163,175)'">&times;</button>
  `;

  const msgEl = el.querySelector('.notif-msg');
  if (msgEl) msgEl.textContent = message;

  const dismiss = () => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(30px) scale(0.95)';
    setTimeout(() => el.remove(), FADE_MS);
  };

  el.querySelector('button')?.addEventListener('click', (e) => { e.stopPropagation(); dismiss(); });
  el.addEventListener('click', dismiss);

  container.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateX(0) scale(1)'; });

  setTimeout(dismiss, opts?.duration ?? 10000);
}

const toast = {
  success: (message: string) => showToast('success', message),
  error: (message: string) => showToast('error', message),
  info: (message: string, opts?: { duration?: number }) => showToast('info', message, opts),
  // Persistent top-right notification card (the old toast.info presentation).
  notify: (message: string, opts?: { duration?: number }) => showNotification(message, opts),
};

export default toast;
