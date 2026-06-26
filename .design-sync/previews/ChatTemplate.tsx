import { ChatTemplate } from 'react-os-shell';

// ChatTemplate — messaging screen: conversation list (SidebarLayout) + message
// thread + composer. Fills its container; give the wrapper a real height.

export function Chat() {
  return (
    <div style={{ height: 600 }}>
      <ChatTemplate />
    </div>
  );
}
