/**
 * EmailTemplate — a three-pane mail client: folder list (SidebarLayout) ·
 * message list · reading pane. Static data; the message list/reading pane are
 * plain markup so the screen renders standalone. Fills its container height.
 */
import { useState } from 'react';
import SidebarLayout from '../shell/SidebarLayout';
import Avatar from '../shell/Avatar';
import Button from '../forms/Button';

const FOLDERS = [
  { id: 'inbox', label: 'Inbox', count: 12 },
  { id: 'starred', label: 'Starred', count: 3 },
  { id: 'sent', label: 'Sent' },
  { id: 'drafts', label: 'Drafts', count: 1 },
  { id: 'archive', label: 'Archive' },
  { id: 'trash', label: 'Trash' },
];

const MESSAGES = [
  { id: 1, from: 'Marco Reyes', subject: 'Q3 roadmap review', preview: 'Sharing the deck ahead of Thursday — let me know…', time: '9:14', unread: true },
  { id: 2, from: 'Priya Patel', subject: 'Design handoff', preview: 'The Figma file is ready for engineering. I exported…', time: '8:02', unread: true },
  { id: 3, from: 'GitHub', subject: '[acme/web] PR #482 merged', preview: 'Your pull request was merged into main by…', time: 'Yest' },
  { id: 4, from: 'Sara Lind', subject: 'Lunch Friday?', preview: 'A few of us are heading to the new place on 5th…', time: 'Yest' },
];

export default function EmailTemplate() {
  const [active, setActive] = useState(1);
  const selected = MESSAGES.find(m => m.id === active) ?? MESSAGES[0];

  return (
    <div className="h-full">
      <SidebarLayout
        side="left"
        defaultWidth={200}
        sidebar={
          <div className="flex h-full flex-col p-2">
            <Button block className="mb-2">Compose</Button>
            {FOLDERS.map((f, i) => (
              <button
                key={f.id}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                  i === 0 ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span>{f.label}</span>
                {f.count != null && <span className="text-xs text-gray-400">{f.count}</span>}
              </button>
            ))}
          </div>
        }
      >
        <div className="flex h-full">
          {/* Message list */}
          <div className="w-72 shrink-0 overflow-auto border-r border-gray-200">
            {MESSAGES.map(m => (
              <button
                key={m.id}
                onClick={() => setActive(m.id)}
                className={`block w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${m.id === active ? 'bg-blue-50/50' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${m.unread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{m.from}</span>
                  <span className="shrink-0 text-[11px] text-gray-400">{m.time}</span>
                </div>
                <div className={`truncate text-sm ${m.unread ? 'text-gray-800' : 'text-gray-600'}`}>{m.subject}</div>
                <div className="truncate text-xs text-gray-400">{m.preview}</div>
              </button>
            ))}
          </div>

          {/* Reading pane */}
          <div className="flex min-w-0 flex-1 flex-col overflow-auto">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-4">
              <h2 className="truncate text-base font-semibold text-gray-900">{selected.subject}</h2>
              <div className="flex shrink-0 gap-1.5">
                <Button variant="ghost" size="sm">Archive</Button>
                <Button variant="secondary" size="sm">Reply</Button>
              </div>
            </div>
            <div className="flex items-center gap-3 border-b border-gray-100 p-4">
              <Avatar name={selected.from} />
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">{selected.from}</div>
                <div className="text-xs text-gray-400">to me · {selected.time}</div>
              </div>
            </div>
            <div className="space-y-3 p-4 text-sm leading-relaxed text-gray-700">
              <p>Hi,</p>
              <p>{selected.preview} The full details are attached — happy to walk through anything on a quick call.</p>
              <p>Best,<br />{selected.from}</p>
            </div>
          </div>
        </div>
      </SidebarLayout>
    </div>
  );
}
