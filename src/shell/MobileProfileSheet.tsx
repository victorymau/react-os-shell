/**
 * Mobile profile sheet — full-screen panel with the user's avatar / name /
 * email at top, then quick-access actions (Customization route if registered,
 * Logout). Mirrors the desktop ProfileMenu popup but laid out as a vertical
 * sheet for touch.
 */

interface MobileProfileSheetProps {
  profile: any;
  user: any;
  onClose: () => void;
  /** Open a route in the shell. */
  onNavigate: (path: string) => void;
  /** Sign the user out (Layout already triggers the logout animation). */
  onLogout: () => void;
}

export default function MobileProfileSheet({ profile, user, onClose, onNavigate, onLogout }: MobileProfileSheetProps) {
  const initial = (profile?.first_name?.charAt(0) || user?.email?.charAt(0) || '?').toUpperCase();
  const displayName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name || ''}`.trim()
    : user?.email ?? 'Account';
  const groups: string[] = profile?.group_names ?? [];

  const handleNav = (path: string) => { onNavigate(path); onClose(); };

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
        <h1 className="text-base font-semibold text-gray-900">Profile</h1>
        <span className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* User header */}
        <div className="flex flex-col items-center text-center px-6 py-8 border-b border-gray-100">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover border border-gray-200 shadow-sm" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-700 shadow-sm">
              {initial}
            </div>
          )}
          <div className="mt-3 text-base font-semibold text-gray-900 truncate max-w-full">{displayName}</div>
          {user?.email && profile?.first_name && (
            <div className="text-sm text-gray-500 truncate max-w-full">{user.email}</div>
          )}
          {groups.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {groups.map(g => (
                <span key={g} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{g}</span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="py-2">
          <button
            onClick={() => handleNav('/customization')}
            className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-100 border-b border-gray-100 text-left"
          >
            <span className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
            <span className="flex-1 text-sm font-medium text-gray-800">Customization</span>
            <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          <button
            onClick={() => { onLogout(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-4 active:bg-red-50 text-left"
          >
            <span className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center text-red-600 shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </span>
            <span className="flex-1 text-sm font-medium text-red-600">Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
