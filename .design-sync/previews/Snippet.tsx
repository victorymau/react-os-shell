import { Snippet } from 'react-os-shell';

// Snippet — a value the user copies rather than reads. Monospace, truncated
// with the whole value on its title, and a copy button that flips to a check
// for two seconds. `value` is copied; `children` is shown.

export function Values() {
  return (
    <div className="max-w-lg space-y-3 p-5">
      <Snippet value="https://api.efficient.test/v1" label="the API base URL" />
      <Snippet value="tnt_8e1c4f2a" label="the tenant id" variant="flat" />
      <Snippet value="npm ci && npm run build" symbol="$" label="the build command" />
      <Snippet value="whsec_9f2c1a" label="the webhook secret" size="sm" />
    </div>
  );
}

// What is shown does not have to be what is copied — a masked key displays
// masked and lands on the clipboard whole.
export function Masked() {
  return (
    <div className="max-w-lg p-5">
      <Snippet value="sk_live_8Hf2c41d9ba0e7a91" label="the API key">
        sk_live_8Hf2…a91
      </Snippet>
    </div>
  );
}

// In a settings panel, beside the fields it lines up with.
export function InAPanel() {
  const rows = [
    { name: 'Webhook endpoint', value: 'https://hooks.efficient.test/t/8e1c4f2a' },
    { name: 'Tenant id', value: 'tnt_8e1c4f2a' },
    { name: 'Region', value: 'ap-southeast-2' },
  ];
  return (
    <div className="max-w-xl p-5">
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {rows.map(r => (
          <div key={r.name} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-sm font-medium text-gray-700">{r.name}</span>
            <Snippet value={r.value} label={r.name} />
          </div>
        ))}
      </div>
    </div>
  );
}

// multiline wraps instead of truncating, for a value whose first 40 characters
// say nothing; hideCopyButton leaves the value and no affordance.
export function MultilineAndReadOnly() {
  return (
    <div className="max-w-lg space-y-3 p-5">
      <Snippet
        multiline
        label="the certificate"
        value={'-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJAK3f2Qe1xR9hMA0GCSqGSIb3DQEBCwUA\n-----END CERTIFICATE-----'}
      />
      <Snippet value="build-2026-09-14-a41f8c" hideCopyButton variant="flat" />
    </div>
  );
}
