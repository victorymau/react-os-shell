import { FormField, Input, Select } from 'react-os-shell';

// FormField — label + control + hint/error wrapper. The standard form row.
// `error` overrides `hint`; `required` appends a red asterisk.

export function FieldRows() {
  return (
    <div className="max-w-md space-y-4 p-5">
      <FormField label="Email" htmlFor="ff-email" required hint="We'll never share it.">
        <Input id="ff-email" type="email" defaultValue="alice@acme.co" />
      </FormField>
      <FormField label="Password" htmlFor="ff-pass" error="Must be at least 8 characters.">
        <Input id="ff-pass" type="password" invalid defaultValue="123" />
      </FormField>
      <FormField label="Role" htmlFor="ff-role">
        <Select
          id="ff-role"
          value="editor"
          onChange={() => {}}
          options={[{ value: 'admin', label: 'Admin' }, { value: 'editor', label: 'Editor' }]}
        />
      </FormField>
    </div>
  );
}
