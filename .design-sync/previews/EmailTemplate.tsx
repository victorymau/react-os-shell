import { EmailTemplate } from 'react-os-shell';

// EmailTemplate — three-pane mail client: folders (SidebarLayout) + message
// list + reading pane. Fills its container, so give the wrapper a real height.

export function Inbox() {
  return (
    <div style={{ height: 600 }}>
      <EmailTemplate />
    </div>
  );
}
