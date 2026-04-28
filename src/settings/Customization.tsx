import { useRef, useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe, updateMe } from '../api/auth';
import { ModalActions } from '../shell/Modal';
import { SOUND_PACKS, SOUND_PACK_KEYS, SOUND_TYPES, SOUND_TYPE_LABELS, getSoundConfig, setSoundForType, setAllSounds, soundsEnabled, previewSound, type SoundType } from '../utils/sounds';

// Preview tiles use literal hex values via arbitrary Tailwind syntax so that the
// active theme's [data-theme="..."] !important overrides don't repaint them
// (the Light preview must stay light even when Dark is the current theme).
const THEMES = [
  { key: 'system', label: 'System', bar1: 'bg-[#e5e7eb]', bar2: 'bg-[#e5e7eb]' },
  { key: 'light', label: 'Light', bar1: 'bg-[#e5e7eb]', bar2: 'bg-[#e5e7eb]' },
  { key: 'dark', label: 'Dark', bar1: 'bg-[#45475a]', bar2: 'bg-[#45475a]' },
  { key: 'pink', label: 'Blossom', bar1: 'bg-[#fbcfe8]', bar2: 'bg-[#fbcfe8]' },
  { key: 'green', label: 'Nature', bar1: 'bg-[#bbf7d0]', bar2: 'bg-[#bbf7d0]' },
  { key: 'grey', label: 'Quicksilver', bar1: 'bg-[#d1d5db]', bar2: 'bg-[#d1d5db]' },
  { key: 'blue', label: 'Ocean', bar1: 'bg-[#bfdbfe]', bar2: 'bg-[#bfdbfe]' },
];

const WALLPAPERS = [
  { src: '/login-bg.avif', label: 'Default' },
  { src: '/wallpaper-ocean.jpg', label: 'Ocean' },
  { src: '/wallpaper-retro.jpg', label: 'Retro' },
  { src: '/wallpaper-stars.jpg', label: 'Stars' },
  { src: '/wallpaper-lake.jpg', label: 'Lake' },
  { src: '/wallpaper-wanaka.jpg', label: 'Wanaka' },
  { src: '/wallpaper-mojave.jpg', label: 'Mojave' },
  { src: '/wallpaper-yosemite.jpg', label: 'Yosemite' },
  { src: '/wallpaper-winter.jpg', label: 'Winter' },
  { src: '/wallpaper-bridge.jpg', label: 'Bridge' },
];

/** Resolve what data-theme is actually active (for preview rendering) */
function resolveTheme(key: string): string {
  if (key === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return key;
}

function getVersion() {
  const now = new Date();
  return `v${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${now.getFullYear()}`;
}

function previewColor(resolved: string, light: string, dark: string, pink: string, green: string, grey?: string, blue?: string) {
  if (resolved === 'dark') return dark;
  if (resolved === 'pink') return pink;
  if (resolved === 'green') return green;
  if (resolved === 'grey') return grey ?? light;
  if (resolved === 'blue') return blue ?? light;
  return light;
}

export default function Customization() {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ['my-profile-sidebar'],
    queryFn: () => getMe(),
  });

  const prefs = profile?.preferences || {};
  const currentTheme: string = prefs.theme || 'system';
  const resolved = resolveTheme(currentTheme);
  const rawBg: string = prefs.desktop_bg || 'random';
  const randomPickRef = useRef(WALLPAPERS[Math.floor(Math.random() * WALLPAPERS.length)].src);
  const desktopBg = rawBg === 'random' ? randomPickRef.current : rawBg;
  const customBg: string = prefs.desktop_bg_custom || '';
  const isColor = desktopBg?.startsWith('#');
  const presetPaths = new Set([...WALLPAPERS.map(w => w.src), 'random']);
  const isCustom = !isColor && desktopBg !== 'none' && rawBg !== 'random' && desktopBg && !presetPaths.has(desktopBg);

  const savePref = (key: string, value: any) => {
    // Optimistic update — apply immediately so theme/settings change instantly
    queryClient.setQueryData(['my-profile-sidebar'], (old: any) => old ? {
      ...old, preferences: { ...(old.preferences || {}), [key]: value },
    } : old);
    queryClient.setQueryData(['my-profile'], (old: any) => old ? {
      ...old, preferences: { ...(old.preferences || {}), [key]: value },
    } : old);
    updateMe({ preferences: { [key]: value } } as any).catch(() => {
      // Revert on failure
      queryClient.invalidateQueries({ queryKey: ['my-profile-sidebar'] });
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    });
  };

  // Debounced save for sliders — updates local state instantly, saves after 300ms idle
  const [localSliders, setLocalSliders] = useState<Record<string, number>>({});
  const sliderTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveSlider = useCallback((key: string, value: number) => {
    setLocalSliders(prev => ({ ...prev, [key]: value }));
    // Apply CSS variable immediately for instant visual feedback
    const cssMap: Record<string, string> = {
      transparency_taskbar: '--taskbar-opacity',
      transparency_inactive_header: '--inactive-header-opacity',
      transparency_inactive_content: '--inactive-content-opacity',
      transparency_active_header: '--active-header-opacity',
      transparency_active_content: '--active-content-opacity',
    };
    if (cssMap[key]) {
      document.documentElement.style.setProperty(cssMap[key], String(value / 100));
    }
    if (sliderTimers.current[key]) clearTimeout(sliderTimers.current[key]);
    sliderTimers.current[key] = setTimeout(() => {
      savePref(key, value);
      setLocalSliders(prev => { const next = { ...prev }; delete next[key]; return next; });
    }, 300);
  }, [savePref]);
  // Cleanup timers on unmount
  useEffect(() => () => { Object.values(sliderTimers.current).forEach(clearTimeout); }, []);

  const prevTaskbarOpacity = (prefs.transparency_taskbar ?? 70) / 100;
  const prevActiveHeaderOpacity = (prefs.transparency_active_header ?? 80) / 100;
  const prevActiveContentOpacity = (prefs.transparency_active_content ?? 90) / 100;
  const taskbarBg = previewColor(resolved, 'bg-white/90', 'bg-[#1e1e2e]/90', 'bg-pink-50/90', 'bg-green-50/90', 'bg-gray-200/90', 'bg-blue-50/90');
  const iconBg = previewColor(resolved, 'bg-gray-200', 'bg-[#313244]', 'bg-pink-200', 'bg-green-200', 'bg-gray-400', 'bg-blue-200');
  const winBg = previewColor(resolved, 'bg-white border border-gray-200', 'bg-[#1e1e2e] border border-[#45475a]', 'bg-white border border-pink-200', 'bg-white border border-green-200', 'bg-gray-100 border border-gray-300', 'bg-blue-50 border border-blue-200');
  const headerBg = previewColor(resolved, 'bg-gray-100', 'bg-[#313244]', 'bg-pink-50', 'bg-green-50', 'bg-gray-300', 'bg-blue-100');
  const accentBg = previewColor(resolved, 'bg-blue-600', 'bg-blue-500', 'bg-pink-600', 'bg-green-600', 'bg-gray-700', 'bg-blue-700');

  return (
    <div className="space-y-6">
      {/* ── Live Preview ── */}
      <div className="flex justify-center">
        <div className="rounded-lg border border-gray-200 overflow-hidden" style={{ width: 480 }}>
          <div className="relative" style={{ height: 300 }}>
            {/* Wallpaper */}
            {isColor ? (
              <div className="absolute inset-0" style={{ backgroundColor: desktopBg }} />
            ) : (
              <img src={desktopBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            {/* Mini taskbar */}
            <div className={`absolute left-0 right-0 bottom-0 h-4 ${taskbarBg} border-t border-gray-200/50 flex items-center px-2 gap-1`} style={{ opacity: prevTaskbarOpacity }}>
              <div className={`h-2 w-8 rounded-sm ${accentBg}`} />
              <div className={`h-2 w-6 rounded-sm ${iconBg}`} />
            </div>
            {/* Desktop icons */}
            <div className="absolute left-4 top-4 flex gap-4">
              {[
                { icon: '📋', label: 'Orders' },
                { icon: '📦', label: 'Products' },
                { icon: '📊', label: 'Reports' },
              ].map(d => (
                <div key={d.label} className="flex flex-col items-center gap-0.5 w-8">
                  <div className="text-sm drop-shadow">{d.icon}</div>
                  <span className="text-[5px] text-white font-medium drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] leading-tight">{d.label}</span>
                </div>
              ))}
            </div>
            {/* Mini window */}
            <div className={`absolute rounded shadow-md ${winBg}`} style={{ left: '35%', top: '20%', width: '55%', height: '55%' }}>
              <div className={`h-3 rounded-t ${headerBg} flex items-center px-1.5 gap-0.5`} style={{ opacity: prevActiveHeaderOpacity }}>
                <div className="w-1 h-1 rounded-full bg-red-400" />
                <div className="w-1 h-1 rounded-full bg-yellow-400" />
                <div className="w-1 h-1 rounded-full bg-green-400" />
              </div>
              <div className="p-1.5 space-y-1" style={{ opacity: prevActiveContentOpacity }}>
                <div className={`h-1 rounded w-3/4 ${iconBg}`} />
                <div className={`h-1 rounded w-1/2 ${iconBg}`} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Theme ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Theme</h3>
        <div className="flex gap-3 flex-wrap">
          {[...THEMES, { key: 'custom', label: 'Custom', bar1: 'bg-gray-200', bar2: 'bg-gray-200' }].map(t => {
            const isCustom = t.key === 'custom';
            const r = isCustom ? 'light' : resolveTheme(t.key);
            const customColor = prefs.accent_color || '#8b5cf6';
            const tAccent = isCustom ? '' : previewColor(r, 'bg-[#2563eb]', 'bg-[#3b82f6]', 'bg-[#db2777]', 'bg-[#16a34a]', 'bg-[#374151]', 'bg-[#1d4ed8]');
            const tBg = isCustom ? 'bg-[#ffffff] border-[#d1d5db]' : previewColor(r, 'bg-[#ffffff] border-[#d1d5db]', 'bg-[#1e1e2e] border-[#45475a]', 'bg-[#fdf2f8] border-[#f9a8d4]', 'bg-[#f0fdf4] border-[#86efac]', 'bg-[#e5e7eb] border-[#9ca3af]', 'bg-[#eff6ff] border-[#93c5fd]');
            return (
              <button key={t.key} onClick={() => {
                if (isCustom) {
                  savePref('theme', 'light');
                  if (!prefs.accent_color) savePref('accent_color', '#8b5cf6');
                } else {
                  savePref('theme', t.key);
                  savePref('accent_color', null);
                }
              }}
                className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-all ${(isCustom ? !!prefs.accent_color : currentTheme === t.key && !prefs.accent_color) ? 'border-blue-500 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className={`w-20 h-14 rounded ${tBg} border overflow-hidden flex flex-col`}>
                  {t.key === 'system' ? (
                    <div className="flex-1 flex">
                      <div className="flex-1 flex flex-col bg-[#ffffff]">
                        <div className="h-2 bg-[#2563eb] w-full" />
                        <div className="flex-1 flex gap-0.5 p-0.5">
                          <div className="w-3 rounded-sm bg-[#f3f4f6]" />
                          <div className="flex-1 flex flex-col gap-0.5">
                            <div className="h-1 rounded-sm w-3/4 bg-[#e5e7eb]" />
                            <div className="h-1 rounded-sm w-1/2 bg-[#e5e7eb]" />
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col bg-[#1e1e2e]">
                        <div className="h-2 bg-[#3b82f6] w-full" />
                        <div className="flex-1 flex gap-0.5 p-0.5">
                          <div className="w-3 rounded-sm bg-[#313244]" />
                          <div className="flex-1 flex flex-col gap-0.5">
                            <div className="h-1 rounded-sm w-3/4 bg-[#45475a]" />
                            <div className="h-1 rounded-sm w-1/2 bg-[#45475a]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : isCustom ? (
                    <>
                      <div className="h-2 w-full" style={{ backgroundColor: customColor }} />
                      <div className="flex-1 flex gap-0.5 p-1">
                        <div className="w-4 rounded-sm bg-[#f3f4f6]" />
                        <div className="flex-1 flex flex-col gap-0.5">
                          <div className="h-1.5 rounded-sm w-3/4 bg-[#e5e7eb]" />
                          <div className="h-1.5 rounded-sm w-1/2 bg-[#e5e7eb]" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={`h-2 ${tAccent} w-full`} />
                      <div className="flex-1 flex gap-0.5 p-1">
                        <div className="flex-1 flex flex-col gap-0.5">
                          <div className={`h-1.5 rounded-sm w-3/4 ${t.bar1}`} />
                          <div className={`h-1.5 rounded-sm w-1/2 ${t.bar2}`} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <span className={`text-xs font-medium ${(isCustom ? !!prefs.accent_color : currentTheme === t.key && !prefs.accent_color) ? 'text-blue-600' : 'text-gray-600'}`}>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Custom color pickers — only visible when Custom theme is selected */}
        {prefs.accent_color && (
          <div className="mt-3 space-y-2">
            {([
              { key: 'custom_bg_color', label: 'Background Color', defaultVal: '#f3f4f6' },
              { key: 'custom_title_color', label: 'Title Color', defaultVal: '#f9fafb' },
              { key: 'custom_window_color', label: 'Windows Background', defaultVal: '#ffffff' },
              { key: 'custom_button_color', label: 'Button Color', defaultVal: '#2563eb' },
              { key: 'accent_color', label: 'Accent Color', defaultVal: '#8b5cf6' },
            ]).map(item => (
              <div key={item.key} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 w-40 shrink-0">{item.label}</span>
                <label className="w-8 h-8 rounded-lg border-2 border-gray-300 overflow-hidden cursor-pointer flex items-center justify-center shrink-0"
                  style={{ backgroundColor: prefs[item.key] || item.defaultVal }}>
                  <input type="color" value={prefs[item.key] || item.defaultVal}
                    onChange={e => savePref(item.key, e.target.value)}
                    className="opacity-0 absolute w-0 h-0" />
                </label>
                <span className="text-xs text-gray-500 font-mono">{prefs[item.key] || item.defaultVal}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Desktop Wallpaper ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Desktop Wallpaper</h3>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={() => savePref('desktop_bg', 'none')}
            className={`w-28 h-20 rounded border-2 overflow-hidden flex items-center justify-center ${rawBg === 'none' ? 'border-blue-500' : 'border-gray-300'}`}
            style={{ backgroundColor: previewColor(resolved, '#f3f4f6', '#1e1e2e', '#fdf2f8', '#f0fdf4', '#d1d5db', '#eff6ff') }}>
            <span className="text-[9px] text-gray-500">None</span>
          </button>
          <button onClick={() => savePref('desktop_bg', 'random')}
            className={`w-28 h-20 rounded border-2 overflow-hidden flex items-center justify-center ${rawBg === 'random' ? 'border-blue-500' : 'border-gray-300'}`}>
            <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
              {WALLPAPERS.slice(0, 4).map(wp => (
                <img key={wp.src} src={wp.src} alt="" loading="lazy" className="w-full h-full object-cover" />
              ))}
            </div>
          </button>
          {WALLPAPERS.map(wp => (
            <button key={wp.src} onClick={() => savePref('desktop_bg', wp.src)}
              className={`w-28 h-20 rounded border-2 overflow-hidden ${rawBg === wp.src ? 'border-blue-500' : 'border-gray-300'}`}>
              <img src={wp.src} alt={wp.label} loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
          {(customBg || isCustom) && (
            <div className="relative group">
              <button onClick={() => savePref('desktop_bg', customBg || desktopBg)}
                className={`w-28 h-20 rounded border-2 overflow-hidden ${isCustom ? 'border-blue-500' : 'border-gray-300'}`}>
                <img src={customBg || desktopBg} alt="Custom" loading="lazy" className="w-full h-full object-cover" />
              </button>
              <button onClick={() => {
                updateMe({ preferences: { desktop_bg: '/login-bg.avif', desktop_bg_custom: '' } } as any).then(() => {
                  queryClient.invalidateQueries({ queryKey: ['my-profile-sidebar'] });
                  queryClient.invalidateQueries({ queryKey: ['my-profile'] });
                });
              }} className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] leading-none opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow">&times;</button>
            </div>
          )}
          <label className="w-28 h-20 rounded border-2 border-gray-300 border-dashed overflow-hidden cursor-pointer flex items-center justify-center text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            <input type="file" accept="image/*" className="hidden" onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onloadend = () => {
                if (reader.result) {
                  updateMe({
                    preferences: { desktop_bg: reader.result as string, desktop_bg_custom: reader.result as string },
                  } as any).then(() => {
                    queryClient.invalidateQueries({ queryKey: ['my-profile-sidebar'] });
                    queryClient.invalidateQueries({ queryKey: ['my-profile'] });
                  });
                }
              };
              reader.readAsDataURL(file);
            }} />
          </label>
        </div>
      </div>

      {/* ── Transparency ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Transparency</h3>
        <div className="space-y-3">
          {([
            { key: 'transparency_taskbar', label: 'Taskbar', defaultVal: 70 },
            { key: 'transparency_start_menu', label: 'Start Menu', defaultVal: 70 },
            { key: 'transparency_inactive_header', label: 'Inactive Windows Header / Footer', defaultVal: 70 },
            { key: 'transparency_inactive_content', label: 'Inactive Windows Content', defaultVal: 80 },
            { key: 'transparency_active_header', label: 'Active Windows Header / Footer', defaultVal: 80 },
            { key: 'transparency_active_content', label: 'Active Windows Content', defaultVal: 90 },
          ] as const).map(item => {
            const val: number = localSliders[item.key] ?? prefs[item.key] ?? item.defaultVal;
            return (
              <div key={item.key} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 w-64 shrink-0">{item.label}</span>
                <input type="range" min={20} max={100} value={val}
                  onChange={e => saveSlider(item.key, Number(e.target.value))}
                  className="flex-1 h-1.5 accent-blue-600 cursor-pointer" />
                <span className="text-xs text-gray-500 w-10 text-right font-mono">{val}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Taskbar ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Taskbar</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700 w-24 shrink-0">Position</span>
            <div className="flex gap-2">
              {(['bottom', 'top', 'left', 'right'] as const).map(pos => (
                <button key={pos} onClick={() => savePref('taskbar_position', pos)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    (prefs.taskbar_position || 'bottom') === pos ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}>{pos.charAt(0).toUpperCase() + pos.slice(1)}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Menu ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Menu</h3>
        <p className="text-xs text-gray-500 mb-3">Controls font size, padding, taskbar height, and window button height across the Start Menu, context menus, dropdowns, and the notification popup.</p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700 w-24 shrink-0">Size</span>
            <div className="flex gap-2">
              {([
                { key: 'small', label: 'Small' },
                { key: 'medium', label: 'Medium' },
                { key: 'large', label: 'Large' },
              ]).map(s => (
                <button key={s.key} onClick={() => savePref('start_menu_size', s.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    (prefs.start_menu_size || 'medium') === s.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700 w-24 shrink-0">Density</span>
            <div className="flex gap-2">
              {([
                { key: 'tight', label: 'Tight' },
                { key: 'normal', label: 'Normal' },
              ]).map(s => (
                <button key={s.key} onClick={() => savePref('menu_density', s.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    (prefs.menu_density || 'normal') === s.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}>{s.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Behavior ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Behavior</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700 w-40 shrink-0">New window position</span>
            <div className="flex gap-2">
              {([
                { key: 'center', label: 'Center' },
                { key: 'cascade', label: 'Cascade' },
              ]).map(s => (
                <button key={s.key} onClick={() => savePref('window_position', s.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    (prefs.window_position || 'cascade') === s.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700 w-40 shrink-0">Double-click desktop</span>
            <div className="flex gap-2">
              {([
                { key: 'deactivate', label: 'Deactivate all' },
                { key: 'nothing', label: 'Do nothing' },
              ]).map(s => (
                <button key={s.key} onClick={() => savePref('desktop_dblclick', s.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    (prefs.desktop_dblclick || 'deactivate') === s.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700 w-40 shrink-0">Default window size</span>
            <div className="flex gap-2">
              {([
                { key: 'small', label: 'Small' },
                { key: 'medium', label: 'Medium' },
                { key: 'large', label: 'Large' },
                { key: 'maximized', label: 'Maximized' },
              ]).map(s => (
                <button key={s.key} onClick={() => savePref('default_window_size', s.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    (prefs.default_window_size || 'large') === s.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}>{s.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Desktop ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Desktop</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={prefs.show_desktop_version ?? true} onChange={e => savePref('show_desktop_version', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          <span className="text-sm text-gray-700">Show version on desktop</span>
          <span className="text-xs text-gray-400 ml-1 font-mono">{getVersion()}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer mt-2">
          <input type="checkbox" checked={prefs.auto_fullscreen ?? false} onChange={e => savePref('auto_fullscreen', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          <span className="text-sm text-gray-700">Enter full screen mode automatically</span>
          <span className="text-xs text-gray-400 ml-1">— on login</span>
        </label>
        <SoundSettings />
      </div>

      <ModalActions>
        <span className="text-xs text-gray-400">Changes are saved automatically</span>
      </ModalActions>
    </div>
  );
}

function SoundSettings() {
  const [enabled, setEnabled] = useState(soundsEnabled());
  const [config, setConfig] = useState(getSoundConfig());

  const update = (soundType: SoundType, packKey: string) => {
    setSoundForType(soundType, packKey);
    setConfig(getSoundConfig());
    previewSound(packKey, soundType);
  };

  const applyAll = (packKey: string) => {
    setAllSounds(packKey);
    setConfig(getSoundConfig());
    previewSound(packKey, 'success');
  };

  return (
    <div className="mt-2 space-y-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={e => { localStorage.setItem('erp_sounds', String(e.target.checked)); setEnabled(e.target.checked); }}
          className="h-4 w-4 rounded border-gray-300 text-blue-600" />
        <span className="text-sm text-gray-700">Sound effects</span>
      </label>
      {enabled && (
        <div className="ml-6">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-2 py-1.5 text-left font-medium text-gray-500 w-24"></th>
                  {SOUND_PACK_KEYS.map(key => (
                    <th key={key} className="px-1 py-1.5 text-center">
                      <button onClick={() => applyAll(key)} className="font-medium text-gray-500 hover:text-blue-600 transition-colors">
                        {SOUND_PACKS[key].label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {SOUND_TYPES.map(soundType => (
                  <tr key={soundType}>
                    <td className="px-2 py-1.5 text-gray-700 font-medium">{SOUND_TYPE_LABELS[soundType]}</td>
                    {SOUND_PACK_KEYS.map(packKey => (
                      <td key={packKey} className="px-1 py-1.5 text-center">
                        <button onClick={() => update(soundType, packKey)}
                          className={`w-4 h-4 rounded-full border-2 transition-colors ${config[soundType] === packKey ? 'bg-blue-600 border-blue-600' : 'border-gray-300 hover:border-blue-400'}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

