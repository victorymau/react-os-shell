/**
 * ChatTemplate — a messaging screen: conversation list (SidebarLayout) + a
 * message thread with a composer. Avatars + bubble rows are plain markup;
 * the composer uses Input + Button. Fills its container height.
 */
import { useState } from 'react';
import SidebarLayout from '../shell/SidebarLayout';
import Avatar from '../shell/Avatar';
import Input from '../forms/Input';
import Button from '../forms/Button';
import type { AvatarStatus } from '../shell/Avatar';

const CONVOS: { id: number; name: string; last: string; time: string; status: AvatarStatus }[] = [
  { id: 1, name: 'Priya Patel', last: 'Sounds good — shipping it now', time: '9:41', status: 'online' },
  { id: 2, name: 'Design team', last: 'Marco: updated the tokens', time: '9:12', status: 'away' },
  { id: 3, name: 'Tom Becker', last: 'Thanks!', time: 'Yest', status: 'offline' },
  { id: 4, name: 'Sara Lind', last: 'See you Friday 🎉', time: 'Yest', status: 'busy' },
];

const THREAD = [
  { mine: false, text: 'Hey! Did the latest build go out?' },
  { mine: true, text: 'Just merged — deploying now.' },
  { mine: false, text: 'Nice. Any breaking changes for the portal?' },
  { mine: true, text: 'Nope, fully additive. New components only.' },
  { mine: false, text: 'Sounds good — shipping it now' },
];

export default function ChatTemplate() {
  const [active, setActive] = useState(1);
  const convo = CONVOS.find(c => c.id === active) ?? CONVOS[0];

  return (
    <div className="h-full">
      <SidebarLayout
        side="left"
        defaultWidth={260}
        sidebar={
          <div className="h-full overflow-auto">
            {CONVOS.map(c => (
              <button
                key={c.id}
                onClick={() => setActive(c.id)}
                className={`flex w-full items-center gap-3 border-b border-gray-100 px-3 py-3 text-left hover:bg-gray-50 ${c.id === active ? 'bg-blue-50/50' : ''}`}
              >
                <Avatar name={c.name} status={c.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">{c.name}</span>
                    <span className="shrink-0 text-[11px] text-gray-400">{c.time}</span>
                  </div>
                  <div className="truncate text-xs text-gray-500">{c.last}</div>
                </div>
              </button>
            ))}
          </div>
        }
      >
        <div className="flex h-full flex-col">
          {/* Thread header */}
          <div className="flex items-center gap-3 border-b border-gray-200 p-3">
            <Avatar name={convo.name} status={convo.status} size="sm" />
            <div>
              <div className="text-sm font-medium text-gray-900">{convo.name}</div>
              <div className="text-xs text-gray-400 capitalize">{convo.status}</div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex flex-1 flex-col gap-2 overflow-auto bg-gray-50 p-4">
            {THREAD.map((m, i) => (
              <div key={i} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  style={{ maxWidth: '75%' }}
                  className={`rounded-2xl px-3 py-2 text-sm ${
                    m.mine ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 shadow-sm'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          {/* Composer */}
          <form className="flex items-center gap-2 border-t border-gray-200 p-3" onSubmit={e => e.preventDefault()}>
            <div className="flex-1">
              <Input placeholder="Type a message…" />
            </div>
            <Button type="submit">Send</Button>
          </form>
        </div>
      </SidebarLayout>
    </div>
  );
}
