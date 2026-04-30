/**
 * Mobile notification sheet — full-screen list popped up from the bottom-nav
 * Notifications button. Reuses the same `NotificationsConfig` Layout receives
 * (so the consumer wires up `useUnreadCount` / `list` / `markRead` / etc.
 * once and both the desktop bell popup and this sheet draw from it).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { formatDate } from '../utils/date';
import type { NotificationsConfig, ShellNotification } from './NotificationBell';

interface MobileNotificationSheetProps {
  config: NotificationsConfig;
  onClose: () => void;
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

export default function MobileNotificationSheet({ config, onClose }: MobileNotificationSheetProps) {
  const { list, markRead, markAllRead, onItemClick } = config;
  const queryClient = useQueryClient();
  const unreadCount = config.useUnreadCount();

  const { data: notifData } = useQuery({
    queryKey: ['notifications-dropdown'],
    queryFn: () => list({ page_size: 30 }),
    staleTime: 30_000,
  });
  const notifications: ShellNotification[] = notifData?.results ?? [];

  const handleClick = useCallback((notif: ShellNotification) => {
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
    onClose();
    onItemClick(notif);
  }, [queryClient, markRead, onItemClick, onClose]);

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

  return (
    <div
      className="fixed inset-0 z-[210] flex flex-col bg-white"
      style={{ paddingBottom: 'var(--mobile-bottom-nav, 70px)' }}
    >
      <header className="flex items-center justify-between px-3 py-3 border-b border-gray-200 shrink-0">
        <button onClick={onClose} className="p-2 -ml-1 rounded-full active:bg-gray-200 text-gray-700" aria-label="Close">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-gray-900">Notifications</h1>
        {unreadCount > 0 ? (
          <button onClick={handleMarkAllRead} className="text-xs text-blue-600 font-medium px-2 py-1 active:bg-blue-50 rounded">
            Mark all read
          </button>
        ) : <span className="w-[88px]" />}
      </header>
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <svg className="h-10 w-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            <p className="text-sm text-gray-700 font-medium">All caught up</p>
            <p className="text-xs text-gray-400 mt-1">No notifications yet</p>
          </div>
        ) : (
          notifications.map(notif => (
            <button
              key={notif.id}
              onClick={() => handleClick(notif)}
              className="w-full flex items-start gap-3 px-4 py-3 active:bg-gray-100 border-b border-gray-100 text-left"
            >
              <div className="pt-1 shrink-0">
                {!notif.is_read
                  ? <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  : <div className="h-2.5 w-2.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm leading-snug ${!notif.is_read ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{notif.title}</p>
                {notif.message && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{notif.message}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] text-gray-400">{timeAgo(notif.created_at)}</span>
                  {notif.actor_name && <span className="text-[11px] text-gray-400">by {notif.actor_name}</span>}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
