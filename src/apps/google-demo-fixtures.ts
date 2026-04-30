/**
 * Demo-mode fixtures for the Google apps (Email, Calendar). Used when
 * `window.__REACT_OS_SHELL_DEMO_MODE__ === true` so the demo deployment
 * can show populated UIs without requiring a Google OAuth Client ID.
 *
 * Imported only by the demo-mode renderers — the real Gmail/Calendar
 * code paths never touch this file.
 */

export interface DemoEmail {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: string; // relative to now
  unread: boolean;
}

// Shape matches Calendar.tsx's CalendarEvent so demo fixtures can be
// dropped straight into its events list without translation.
export interface DemoCalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  start_time?: string; // HH:MM
  end_time?: string;   // HH:MM
  color: string;       // matches the COLORS keys in Calendar.tsx
  description?: string;
}

export function getDemoEmails(): DemoEmail[] {
  const now = Date.now();
  const m = (mins: number) => new Date(now - mins * 60_000).toISOString();
  return [
    {
      id: 'demo-1',
      from: 'Calendar <calendar-noreply@example.com>',
      subject: 'Reminder: Design review at 3:00 PM',
      snippet: 'You have a design review starting in 30 minutes with the platform team…',
      body: 'You have a design review starting in 30 minutes with the platform team. Agenda is in the doc — please skim before joining.',
      receivedAt: m(15),
      unread: true,
    },
    {
      id: 'demo-2',
      from: 'Sam Patel <sam@example.com>',
      subject: 'Re: STEP file from procurement',
      snippet: "Got it — I'll drop the file in the shared folder by EOD. Let me know if the cap thickness needs to change.",
      body: "Got it — I'll drop the file in the shared folder by EOD. Let me know if the cap thickness needs to change.\n\nThanks,\nSam",
      receivedAt: m(85),
      unread: true,
    },
    {
      id: 'demo-3',
      from: 'GitHub <noreply@github.com>',
      subject: '[react-os-shell] PR #42 ready for review',
      snippet: 'A new pull request has been opened in your repository react-os-shell.',
      body: 'A new pull request has been opened in your repository react-os-shell.\n\n#42: feat(preview): capped section view\n\nView on GitHub: https://github.com/...',
      receivedAt: m(180),
      unread: false,
    },
    {
      id: 'demo-4',
      from: 'Stripe <noreply@stripe.com>',
      subject: 'Your Stripe payout has been processed',
      snippet: 'Your payout of $1,247.32 has been deposited to your bank account.',
      body: 'Your payout of $1,247.32 has been deposited to your bank account ending in 4242.\n\nView details in your Dashboard.',
      receivedAt: m(310),
      unread: false,
    },
    {
      id: 'demo-5',
      from: 'Maya Lin <maya.lin@example.com>',
      subject: 'Lunch tomorrow?',
      snippet: 'I have a couple options open — that ramen place on 4th, or the new Korean place near you?',
      body: 'I have a couple options open — that ramen place on 4th, or the new Korean place near you? 12:30?',
      receivedAt: m(720),
      unread: false,
    },
    {
      id: 'demo-6',
      from: 'AWS Billing <no-reply@aws.amazon.com>',
      subject: 'Your monthly AWS invoice',
      snippet: 'Your invoice for the period ending Apr 30 is now available.',
      body: 'Your invoice for the period ending April 30 is now available in the AWS console. Total: $84.21.',
      receivedAt: m(1440),
      unread: false,
    },
  ];
}

// 6 events scattered across the current week. The dates are recomputed
// relative to "now" each time the function runs, so the demo always
// feels current.
export function getDemoCalendarEvents(): DemoCalendarEvent[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek);
  const dateAt = (dayOffset: number) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + dayOffset);
    return d.toISOString().split('T')[0];
  };
  return [
    { id: 'demo-event-1', title: 'Standup',         date: dateAt(1), start_time: '09:30', end_time: '10:00', color: 'blue' },
    { id: 'demo-event-2', title: 'Design review',   date: dateAt(2), start_time: '15:00', end_time: '16:00', color: 'purple', description: 'Platform team — Conference Room B' },
    { id: 'demo-event-3', title: 'Lunch with Maya', date: dateAt(3), start_time: '12:30', end_time: '13:30', color: 'orange', description: 'Ramen on 4th' },
    { id: 'demo-event-4', title: '1:1 with manager',date: dateAt(3), start_time: '16:00', end_time: '16:30', color: 'green' },
    { id: 'demo-event-5', title: 'Sprint planning', date: dateAt(4), start_time: '10:00', end_time: '11:30', color: 'pink' },
    { id: 'demo-event-6', title: 'Focus time',      date: dateAt(5), start_time: '14:00', end_time: '17:00', color: 'gray' },
  ];
}

export function isDemoMode(): boolean {
  return typeof window !== 'undefined' && (window as any).__REACT_OS_SHELL_DEMO_MODE__ === true;
}
