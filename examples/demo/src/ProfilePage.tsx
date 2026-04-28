import { useShellPrefs } from 'react-os-shell';

const PRODUCT_ICON = `${import.meta.env.BASE_URL}favicon.svg`;
const AVATAR = `${import.meta.env.BASE_URL}demo-avatar.webp`;

const FIELDS: { key: string; label: string; type: 'text' | 'textarea' }[] = [
  { key: 'profile_display_name', label: 'Display name', type: 'text' },
  { key: 'profile_role', label: 'Role / title', type: 'text' },
  { key: 'profile_bio', label: 'Bio', type: 'textarea' },
];

export default function ProfilePage() {
  const { prefs, save } = useShellPrefs();

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <header className="flex items-center gap-4">
        <img
          src={AVATAR}
          alt=""
          className="h-16 w-16 rounded-full border border-gray-200 object-cover bg-gray-100"
          onError={e => { (e.currentTarget as HTMLImageElement).src = PRODUCT_ICON; }}
        />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900">Demo User</h1>
          <p className="text-xs text-gray-500">demo@example.com</p>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wide text-gray-400 uppercase">Profile</h2>
        {FIELDS.map(field => (
          <label key={field.key} className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">{field.label}</span>
            {field.type === 'textarea' ? (
              <textarea
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                value={prefs[field.key] ?? ''}
                onChange={e => save({ [field.key]: e.target.value })}
              />
            ) : (
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                value={prefs[field.key] ?? ''}
                onChange={e => save({ [field.key]: e.target.value })}
              />
            )}
          </label>
        ))}
      </section>

      <p className="text-[11px] text-gray-400 italic pt-2 border-t border-gray-100">
        Demo only — values persist to localStorage via the package&apos;s <code>useShellPrefs()</code>.
      </p>
    </div>
  );
}
