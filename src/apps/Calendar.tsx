import { useState, useMemo, useCallback, useEffect } from 'react';
import Modal, { ModalActions } from '../shell/Modal';
import toast from '../shell/toast';
import useGoogleAuth, { getGoogleAccessToken } from '../hooks/useGoogleAuth';
import { useShellPrefs } from '../shell/ShellPrefs';

// ── Types ──
interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  start_time?: string; // HH:MM
  end_time?: string; // HH:MM
  color: string;
  description?: string;
  all_day?: boolean;
}

type ViewMode = 'month' | 'week';

const COLORS = [
  { key: 'blue', bg: 'bg-blue-500', light: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  { key: 'green', bg: 'bg-green-500', light: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
  { key: 'red', bg: 'bg-red-500', light: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  { key: 'purple', bg: 'bg-purple-500', light: 'bg-purple-100 text-purple-800', dot: 'bg-purple-500' },
  { key: 'orange', bg: 'bg-orange-500', light: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  { key: 'pink', bg: 'bg-pink-500', light: 'bg-pink-100 text-pink-800', dot: 'bg-pink-500' },
  { key: 'yellow', bg: 'bg-yellow-500', light: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500' },
  { key: 'gray', bg: 'bg-gray-500', light: 'bg-gray-100 text-gray-800', dot: 'bg-gray-500' },
];

function getColor(key: string) {
  return COLORS.find(c => c.key === key) || COLORS[0];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n: number) { return String(n).padStart(2, '0'); }

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const cells: { date: Date; isCurrentMonth: boolean }[] = [];
  // Previous month padding
  for (let i = startDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevDays - i), isCurrentMonth: false });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  // Next month padding
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
  }
  return cells;
}

function getWeekDays(date: Date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

// ── Main Component ──
export default function Calendar() {
  const { prefs, save } = useShellPrefs();
  const google = useGoogleAuth();
  const localEvents: CalendarEvent[] = prefs.calendar_events || [];
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const events = useMemo(() => [...localEvents, ...googleEvents], [localEvents, googleEvents]);
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  // Fetch Google Calendar events
  useEffect(() => {
    const token = getGoogleAccessToken();
    if (!token) { setGoogleEvents([]); return; }
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const timeMin = new Date(year, month - 1, 1).toISOString();
    const timeMax = new Date(year, month + 2, 0).toISOString();
    fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&maxResults=250&singleEvents=true&orderBy=startTime`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.items) return;
        const mapped: CalendarEvent[] = data.items.map((item: any) => {
          const isAllDay = !!item.start?.date;
          const startDate = isAllDay ? item.start.date : item.start?.dateTime?.split('T')[0];
          const startTime = isAllDay ? undefined : item.start?.dateTime?.split('T')[1]?.slice(0, 5);
          const endTime = isAllDay ? undefined : item.end?.dateTime?.split('T')[1]?.slice(0, 5);
          return {
            id: `gcal-${item.id}`,
            title: item.summary || '(No title)',
            date: startDate,
            start_time: startTime,
            end_time: endTime,
            color: 'blue',
            all_day: isAllDay,
            description: item.description,
            _google: true,
          } as CalendarEvent;
        });
        setGoogleEvents(mapped);
      })
      .catch(() => setGoogleEvents([]));
  }, [currentDate]);
  const [view, setView] = useState<ViewMode>('month');
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [newEventDate, setNewEventDate] = useState<string | null>(null);

  const saveLocalEvents = useCallback((updated: CalendarEvent[]) => {
    save({ calendar_events: updated });
  }, [save]);

  const saveEvent = (evt: CalendarEvent) => {
    const existing = localEvents.find(e => e.id === evt.id);
    if (existing) {
      saveLocalEvents(localEvents.map(e => e.id === evt.id ? evt : e));
    } else {
      saveLocalEvents([...localEvents, evt]);
    }
    setEditingEvent(null);
    setNewEventDate(null);
  };

  const deleteEvent = (id: string) => {
    saveLocalEvents(localEvents.filter(e => e.id !== id));
    setEditingEvent(null);
  };

  // ── Navigation ──
  const goToday = () => setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const goPrev = () => {
    if (view === 'month') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    }
  };
  const goNext = () => {
    if (view === 'month') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    }
  };

  const monthLabel = currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(e => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    // Sort by start_time within each day
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    }
    return map;
  }, [events]);

  const handleDayClick = (dateStr: string) => {
    setNewEventDate(dateStr);
    setEditingEvent({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: '',
      date: dateStr,
      start_time: '09:00',
      end_time: '10:00',
      color: 'blue',
      all_day: false,
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={goToday} className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Today</button>
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="p-1 rounded hover:bg-gray-100">
              <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>
            <button onClick={goNext} className="p-1 rounded hover:bg-gray-100">
              <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </button>
          </div>
          <h2 className="text-sm font-semibold text-gray-900">{monthLabel}</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Google Calendar connection */}
          {google.isConnected ? (
            <button onClick={() => window.dispatchEvent(new Event('open-google-connect'))} title="Google Services"
              className="flex items-center gap-2 hover:bg-gray-50 rounded-md px-1.5 py-1 transition-colors">
              {google.user?.picture ? (
                <img src={google.user.picture} alt="" className="h-6 w-6 rounded-full" />
              ) : (
                <div className="h-6 w-6 rounded-full bg-gray-200" />
              )}
              <div className="text-left">
                <p className="text-[11px] font-medium text-gray-900">{google.user?.name}</p>
                <p className="text-[10px] text-gray-500">{google.user?.email}</p>
              </div>
            </button>
          ) : (
            <button onClick={() => {
              if (!google.hasClientId) {
                const id = prompt('Enter your Google OAuth Client ID\n\nCreate one at console.cloud.google.com > APIs > Credentials > OAuth 2.0 Client ID (Web application)');
                if (id?.trim()) google.setClientId(id.trim());
                return;
              }
              google.connect();
            }} disabled={google.loading}
              className="inline-flex items-center gap-1.5 border border-gray-300 bg-white rounded-md px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {google.loading ? 'Connecting...' : 'Connect Google Calendar'}
            </button>
          )}
          {google.error && <span className="text-[10px] text-red-500">{google.error}</span>}

          <div className="w-px h-4 bg-gray-200" />
          <div className="flex gap-1">
            {(['month', 'week'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${view === v ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-hidden">
        {view === 'month' ? (
          <MonthView
            year={currentDate.getFullYear()}
            month={currentDate.getMonth()}
            eventsByDate={eventsByDate}
            today={toDateStr(today)}
            onDayClick={handleDayClick}
            onEventClick={setEditingEvent}
          />
        ) : (
          <WeekView
            currentDate={currentDate}
            eventsByDate={eventsByDate}
            today={toDateStr(today)}
            onDayClick={handleDayClick}
            onEventClick={setEditingEvent}
          />
        )}
      </div>

      {/* Event editor modal */}
      {editingEvent && (
        <EventEditor
          event={editingEvent}
          isNew={!!newEventDate}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => { setEditingEvent(null); setNewEventDate(null); }}
        />
      )}
    </div>
  );
}

// ── Month View ──
function MonthView({ year, month, eventsByDate, today, onDayClick, onEventClick }: {
  year: number; month: number; eventsByDate: Record<string, CalendarEvent[]>;
  today: string; onDayClick: (d: string) => void; onEventClick: (e: CalendarEvent) => void;
}) {
  const cells = useMemo(() => getMonthDays(year, month), [year, month]);

  return (
    <div className="h-full flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAYS.map(d => (
          <div key={d} className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase text-center">{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 flex-1 auto-rows-fr">
        {cells.map((cell, i) => {
          const dateStr = toDateStr(cell.date);
          const isToday = dateStr === today;
          const dayEvents = eventsByDate[dateStr] || [];
          return (
            <div key={i}
              onClick={() => onDayClick(dateStr)}
              className={`border-b border-r border-gray-100 px-1 py-0.5 cursor-pointer hover:bg-blue-50/50 transition-colors overflow-hidden ${!cell.isCurrentMonth ? 'bg-gray-50/50' : ''}`}
            >
              <div className={`text-[11px] font-medium mb-0.5 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : cell.isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}`}>
                {cell.date.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(evt => {
                  const c = getColor(evt.color);
                  return (
                    <button key={evt.id} onClick={e => { e.stopPropagation(); onEventClick(evt); }}
                      className={`w-full text-left truncate rounded px-1 py-0.5 text-[10px] leading-tight font-medium ${c.light} hover:opacity-80 transition-opacity`}>
                      {!evt.all_day && evt.start_time && <span className="text-[9px] opacity-70 mr-0.5">{evt.start_time}</span>}
                      {evt.title || 'Untitled'}
                    </button>
                  );
                })}
                {dayEvents.length > 3 && (
                  <p className="text-[9px] text-gray-400 pl-1">+{dayEvents.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week View ──
function WeekView({ currentDate, eventsByDate, today, onDayClick, onEventClick }: {
  currentDate: Date; eventsByDate: Record<string, CalendarEvent[]>;
  today: string; onDayClick: (d: string) => void; onEventClick: (e: CalendarEvent) => void;
}) {
  const days = useMemo(() => getWeekDays(currentDate), [currentDate]);

  return (
    <div className="h-full flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {days.map(d => {
          const dateStr = toDateStr(d);
          const isToday = dateStr === today;
          return (
            <div key={dateStr} className="px-2 py-2 text-center">
              <p className="text-[10px] font-medium text-gray-500 uppercase">{DAYS[d.getDay()]}</p>
              <p className={`text-lg font-semibold mt-0.5 ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>{d.getDate()}</p>
            </div>
          );
        })}
      </div>
      {/* Day columns */}
      <div className="grid grid-cols-7 flex-1 overflow-y-auto">
        {days.map(d => {
          const dateStr = toDateStr(d);
          const dayEvents = eventsByDate[dateStr] || [];
          return (
            <div key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className="border-r border-gray-100 px-1.5 py-2 cursor-pointer hover:bg-blue-50/30 transition-colors min-h-[200px]">
              <div className="space-y-1">
                {dayEvents.map(evt => {
                  const c = getColor(evt.color);
                  return (
                    <button key={evt.id} onClick={e => { e.stopPropagation(); onEventClick(evt); }}
                      className={`w-full text-left rounded-md px-2 py-1.5 ${c.light} hover:opacity-80 transition-opacity`}>
                      <p className="text-xs font-medium truncate">{evt.title || 'Untitled'}</p>
                      {!evt.all_day && evt.start_time && (
                        <p className="text-[10px] opacity-70">{evt.start_time}{evt.end_time ? ` - ${evt.end_time}` : ''}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Event Editor ──
function EventEditor({ event, isNew, onSave, onDelete, onClose }: {
  event: CalendarEvent; isNew: boolean;
  onSave: (e: CalendarEvent) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(event.date);
  const [startTime, setStartTime] = useState(event.start_time || '09:00');
  const [endTime, setEndTime] = useState(event.end_time || '10:00');
  const [color, setColor] = useState(event.color);
  const [allDay, setAllDay] = useState(event.all_day ?? false);
  const [description, setDescription] = useState(event.description || '');

  const handleSave = () => {
    if (!title.trim()) { toast.error('Event title is required.'); return; }
    onSave({
      ...event,
      title: title.trim(),
      date,
      start_time: allDay ? undefined : startTime,
      end_time: allDay ? undefined : endTime,
      color,
      all_day: allDay,
      description: description.trim() || undefined,
    });
  };

  const inp = 'block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm';

  return (
    <Modal open onClose={onClose} title={isNew ? 'New Event' : 'Edit Event'} size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className={inp} placeholder="Event title" autoFocus />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          <span className="text-sm text-gray-700">All day</span>
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inp} />
            </div>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button key={c.key} onClick={() => setColor(c.key)}
                className={`w-6 h-6 rounded-full ${c.bg} border-2 transition-all ${color === c.key ? 'border-gray-700 scale-110' : 'border-transparent hover:border-gray-400'}`} />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={inp} placeholder="Optional notes..." />
        </div>
      </div>

      {!isNew && (
        <ModalActions position="left">
          <button onClick={() => onDelete(event.id)} className="text-sm text-red-600 hover:text-red-800 font-medium">Delete</button>
        </ModalActions>
      )}
      <ModalActions>
        <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 text-sm font-medium rounded-lg hover:bg-blue-700">
          {isNew ? 'Create' : 'Save'}
        </button>
      </ModalActions>
    </Modal>
  );
}
