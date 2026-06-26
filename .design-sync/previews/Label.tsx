import { Label, Input } from 'react-os-shell';

// Label — standalone field label in the kit's style (FormField subsumes most
// uses). `required` appends a red asterisk.

export function Basic() {
  return (
    <div className="max-w-md space-y-1 p-5">
      <Label htmlFor="lbl-name" required>Workspace name</Label>
      <Input id="lbl-name" defaultValue="Acme Inc." />
    </div>
  );
}
