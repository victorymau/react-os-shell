import { Card, Button } from 'react-os-shell';

// Card — the kit's standard surface, with optional header/footer rows.

export function Variants() {
  return (
    <div className="max-w-md space-y-4 p-5">
      <Card header="Team plan">
        <p className="text-sm text-gray-600">Unlimited projects, priority support, and SSO.</p>
      </Card>
      <Card
        header="Invite teammates"
        footer={<div className="flex justify-end"><Button size="sm">Send invites</Button></div>}
      >
        <p className="text-sm text-gray-600">Add members to your workspace by email.</p>
      </Card>
    </div>
  );
}
