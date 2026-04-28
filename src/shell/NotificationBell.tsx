import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../utils/date';
import toast from './toast';
import { PopupMenu, PopupMenuItem, PopupMenuDivider, PopupMenuLabel } from './PopupMenu';

/** Generic notification shape consumed by the shell. Consumer-specific
 * fields live on `extra` (or just on additional properties — TS structural
 * typing is permissive). */
export interface ShellNotification {
  id: string;
  title: string;
  message?: string;
  entity_type?: string;
  entity_id?: string;
  entity_label?: string;
  is_read: boolean;
  actor_name?: string;
  created_at: string;
}

/** Config bundle for the notification system. Supplied by the consumer;
 * the shell never calls a hardcoded URL. */
export interface NotificationsConfig {
  /** Hook called inside <NotificationBell> on every render. Return the
   *  current unread count for the signed-in user. */
  useUnreadCount: () => number;
  /** Fetcher for the dropdown list (most recent first). */
  list: (params?: { page_size?: number }) => Promise<{ results: ShellNotification[] }>;
  /** Mark a single notification as read. */
  markRead: (id: string) => Promise<unknown>;
  /** Mark every unread notification as read. */
  markAllRead: () => Promise<unknown>;
  /** Click handler for a notification item. */
  onItemClick: (notif: ShellNotification) => void;
  /** Click handler for "View all notifications". When omitted, the link is hidden. */
  onViewAll?: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

interface NotificationBellProps extends NotificationsConfig {
  popDirection?: 'left' | 'right';
}

export default function NotificationBell({
  useUnreadCount, list, markRead, markAllRead, onItemClick, onViewAll, popDirection,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();

  const unreadCount = useUnreadCount();

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }, []);

  const prevCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevCountRef.current === null) { prevCountRef.current = unreadCount; return; }
    if (unreadCount > prevCountRef.current) {
      list({ page_size: 1 }).then(data => {
        const latest = data?.results?.[0];
        if (!latest) return;
        const title = latest.title || 'New Notification';
        const body = latest.message || latest.entity_label || '';
        if (document.hidden) {
          if ('Notification' in window && Notification.permission === 'granted') {
            const n = new Notification(title, { body, icon: '/favicon.svg', tag: `notif-${latest.id}` });
            n.onclick = () => { window.focus(); onItemClick(latest); n.close(); };
          }
        } else {
          toast.info(title, { duration: 5000 });
        }
      }).catch(() => {});
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount, list, onItemClick]);

  // Always run on mount + every 30s so the dropdown is always populated
  // with cached data before the first click — no loading-state flash.
  const { data: notifData } = useQuery({
    queryKey: ['notifications-dropdown'],
    queryFn: () => list({ page_size: 30 }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const notifications: ShellNotification[] = notifData?.results ?? [];

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent | MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-menu-toggle]')) return;
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [open]);

  const handleClick = (notif: ShellNotification) => {
    if (!notif.is_read) {
      queryClient.setQueryData(['notification-unread-count'], (old: any) => old ? { ...old, count: Math.max(0, (old.count || 0) - 1) } : old);
      queryClient.setQueryData(['notifications-dropdown'], (old: any) => {
        if (!old?.results) return old;
        return { ...old, results: old.results.map((n: any) => n.id === notif.id ? { ...n, is_read: true } : n) };
      });
      markRead(notif.id).catch(() => {
        queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
        queryClient.invalidateQueries({ queryKey: ['notifications-dropdown'] });
      });
    }
    setOpen(false);
    onItemClick(notif);
  };

  const handleMarkAllRead = () => {
    queryClient.setQueryData(['notification-unread-count'], (old: any) => old ? { ...old, count: 0 } : old);
    queryClient.setQueryData(['notifications-dropdown'], (old: any) => {
      if (!old?.results) return old;
      return { ...old, results: old.results.map((n: any) => ({ ...n, is_read: true })) };
    });
    markAllRead().then(() => {
      queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-dropdown'] });
    });
  };

  const [dropdownPos, setDropdownPos] = useState<Record<string, number | string>>({});
  const calcPos = useCallback(() => {
    const taskbarPos = getComputedStyle(document.documentElement).getPropertyValue('--taskbar-position')?.trim() || 'bottom';
    const taskbarH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height')) || 56;
    const taskbarW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-width')) || 0;
    const verticalReserve = (taskbarPos === 'top' || taskbarPos === 'bottom') ? taskbarH + 16 : 16;
    const maxHeight = `calc(100vh - ${verticalReserve}px)`;
    if (popDirection === 'right') setDropdownPos({ left: taskbarW + 8, bottom: 8, maxHeight });
    else if (popDirection === 'left') setDropdownPos({ right: taskbarW + 8, bottom: 8, maxHeight });
    else if (taskbarPos === 'top') setDropdownPos({ right: 8, top: taskbarH + 8, maxHeight });
    else setDropdownPos({ right: 8, bottom: taskbarH + 8, maxHeight });
  }, [popDirection]);
  useEffect(() => {
    if (!open) return;
    calcPos();
    window.addEventListener('resize', calcPos);
    return () => window.removeEventListener('resize', calcPos);
  }, [open, calcPos]);

  return (
    <div ref={dropdownRef} className="relative">
      <button ref={buttonRef} data-menu-toggle
        onMouseEnter={() => queryClient.prefetchQuery({ queryKey: ['notifications-dropdown'], queryFn: () => list({ page_size: 30 }) })}
        onClick={() => setOpen(prev => !prev)}
        title="Notifications"
        className="relative shrink-0 rounded-md p-2 text-gray-900 hover:text-black hover:bg-white/20 transition-colors">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <PopupMenu minWidth={320} className="w-80 flex flex-col overflow-hidden" style={{ ...dropdownPos }} onClose={() => setOpen(false)}>
          <PopupMenuLabel>
            <span className="flex items-center justify-between w-full">
              <span>Notifications</span>
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead} className="text-[10px] text-blue-600 hover:text-blue-700 font-medium normal-case tracking-normal">
                  Mark all read
                </button>
              )}
            </span>
          </PopupMenuLabel>
          <PopupMenuDivider />
          <div className="overflow-y-auto" style={{ flex: '1 1 auto', minHeight: 0 }}>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <svg className="h-8 w-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <p className="text-sm text-gray-600 font-medium">All caught up</p>
              <p className="text-xs text-gray-400 mt-0.5">No notifications yet</p>
            </div>
          ) : (
            notifications.map(notif => (
              <PopupMenuItem key={notif.id} onClick={() => handleClick(notif)}>
                <div className="pt-0.5 shrink-0">
                  {!notif.is_read ? <div className="h-2 w-2 rounded-full bg-blue-500" /> : <div className="h-2 w-2" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm leading-tight ${!notif.is_read ? 'font-medium' : ''}`}>{notif.title}</p>
                  {notif.message && <p className="text-xs text-gray-500 mt-0.5 truncate">{notif.message}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-gray-400">{timeAgo(notif.created_at)}</span>
                    {notif.actor_name && <span className="text-[10px] text-gray-400">by {notif.actor_name}</span>}
                  </div>
                </div>
              </PopupMenuItem>
            ))
          )}
          </div>
          {onViewAll && (
            <>
              <PopupMenuDivider />
              <PopupMenuItem onClick={() => { setOpen(false); onViewAll(); }}>
                <span className="w-full text-center text-xs text-blue-600 font-medium">View all notifications</span>
              </PopupMenuItem>
            </>
          )}
        </PopupMenu>,
        document.body
      )}
    </div>
  );
}
