import { useState, useMemo, useCallback, useEffect } from 'react';
import Modal, { ModalActions } from '../shell/Modal';
import toast from '../shell/toast';
import useMailAuth from '../hooks/useMailAuth';
import { getMailClient } from '../api/mailClient';
import { useShellPrefs } from '../shell/ShellPrefs';
import { useTodoTasks } from './_todoStore';

// ── Types ──
interface CalDavMeta {
  calendarId: string;
  eventUid: string;
  etag: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  start_time?: string;
  end_time?: string;
  color: string;
  description?: string;
  all_day?: boolean;
  // Internal markers (not persisted in useShellPrefs for non-local events):
  _caldav?: CalDavMeta;
  _todo?: boolean;
  _todoId?: string;
  _done?: boolean;
}

interface DavCalendar {
  id: string;
  displayName: string;
  color: string | null;
  ctag: string;
  readOnly: boolean;
}

interface DavEvent {
  uid: string;
  etag: string;
  url: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  recurrence: string | null;
  status: string;
}

type ViewMode = 'year' | 'month' | 'week';

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
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const cells: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = startDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevDays - i), isCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
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

function davToLocal(ev: DavEvent, calendarId: string): CalendarEvent {
  const startIso = ev.start;
  const endIso = ev.end;
  const startDate = startIso.slice(0, 10);
  const startTime = ev.allDay ? undefined : startIso.slice(11, 16);
  const endTime = ev.allDay ? undefined : endIso.slice(11, 16);
  return {
    id: `caldav-${calendarId}-${ev.uid}`,
    title: ev.summary || '(No title)',
    date: startDate,
    start_time: startTime,
    end_time: endTime,
    color: 'blue',
    all_day: ev.allDay,
    description: ev.description || undefined,
    _caldav: { calendarId, eventUid: ev.uid, etag: ev.etag },
  };
}

function toDavInput(evt: CalendarEvent): {
  summary: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
} {
  const start = evt.all_day
    ? evt.date
    : `${evt.date}T${evt.start_time || '09:00'}:00`;
  const end = evt.all_day
    ? evt.date
    : `${evt.date}T${evt.end_time || '10:00'}:00`;
  return {
    summary: evt.title,
    description: evt.description,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    allDay: !!evt.all_day,
  };
}

// ── Main Component ──
export default function Calendar() {
  const { prefs, save } = useShellPrefs();
  const { isConnected, capabilities } = useMailAuth();
  const caldavEnabled = isConnected && capabilities?.caldav === true;
  const localEvents: CalendarEvent[] = prefs.calendar_events || [];

  const [calendars, setCalendars] = useState<DavCalendar[]>([]);
  const [caldavEvents, setCaldavEvents] = useState<CalendarEvent[]>([]);

  const { tasks: todoTasks, toggleDone: toggleTodoDone } = useTodoTasks();
  const todoEvents = useMemo<CalendarEvent[]>(
    () => todoTasks
      .filter(t => !!t.dueDate)
      .map(t => ({
        id: `todo-${t.id}`,
        title: t.name,
        date: t.dueDate!,
        color: 'gray',
        _todo: true,
        _todoId: t.id,
        _done: t.done,
      })),
    [todoTasks],
  );

  const events = useMemo(
    () => [...localEvents, ...caldavEvents, ...todoEvents],
    [localEvents, caldavEvents, todoEvents],
  );

  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState<ViewMode>('month');
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [newEventDate, setNewEventDate] = useState<string | null>(null);

  // Fetch calendars once when CalDAV becomes available
  useEffect(() => {
    if (!caldavEnabled) { setCalendars([]); return; }
    getMailClient()
      .get<{ calendars: DavCalendar[] }>('/api/calendar/calendars')
      .then(r => setCalendars(r.data.calendars))
      .catch(() => setCalendars([]));
  }, [caldavEnabled]);

  // Fetch events when current date changes (a 3-month window for prefetch)
  useEffect(() => {
    if (!caldavEnabled || calendars.length === 0) { setCaldavEvents([]); return; }
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const start = new Date(y, m - 1, 1).toISOString();
    const end = new Date(y, m + 2, 0).toISOString();

    let cancelled = false;
    Promise.all(
      calendars.map(cal =>
        getMailClient()
          .get<{ events: DavEvent[] }>(`/api/calendar/calendars/${encodeURIComponent(cal.id)}/events`, {
            params: { start, end },
          })
          .then(r => r.data.events.map(e => davToLocal(e, cal.id)))
          .catch(() => [] as CalendarEvent[]),
      ),
    ).then(perCalendar => {
      if (cancelled) return;
      setCaldavEvents(perCalendar.flat());
    });
    return () => { cancelled = true; };
  }, [caldavEnabled, calendars, currentDate]);

  const saveLocalEvents = useCallback((updated: CalendarEvent[]) => {
    save({ calendar_events: updated });
  }, [save]);

  const saveEvent = async (evt: CalendarEvent, targetCalendarId?: string) => {
    // Editing an existing CalDAV event
    if (evt._caldav) {
      try {
        const input = toDavInput(evt);
        const res = await getMailClient().put<{ uid: string; etag: string }>(
          `/api/calendar/calendars/${encodeURIComponent(evt._caldav.calendarId)}/events/${encodeURIComponent(evt._caldav.eventUid)}`,
          input,
          { headers: { 'If-Match': evt._caldav.etag } },
        );
        setCaldavEvents(prev => prev.map(e =>
          e.id === evt.id
            ? { ...evt, _caldav: { ...evt._caldav!, etag: res.data.etag } }
            : e
        ));
        toast.success('Event updated');
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 409) {
          toast.error('Event was modified elsewhere — refresh to see latest');
        } else {
          toast.error(extractError(err));
        }
        return;
      }
    } else if (targetCalendarId) {
      // New CalDAV event
      try {
        const input = toDavInput(evt);
        const res = await getMailClient().post<{ uid: string; etag: string; url: string }>(
          `/api/calendar/calendars/${encodeURIComponent(targetCalendarId)}/events`,
          input,
        );
        const newEvt: CalendarEvent = {
          ...evt,
          id: `caldav-${targetCalendarId}-${res.data.uid}`,
          _caldav: { calendarId: targetCalendarId, eventUid: res.data.uid, etag: res.data.etag },
        };
        setCaldavEvents(prev => [...prev, newEvt]);
        toast.success('Event created');
      } catch (err) {
        toast.error(extractError(err));
        return;
      }
    } else {
      // Local event
      const existing = localEvents.find(e => e.id === evt.id);
      if (existing) {
        saveLocalEvents(localEvents.map(e => e.id === evt.id ? evt : e));
      } else {
        saveLocalEvents([...localEvents, evt]);
      }
    }
    setEditingEvent(null);
    setNewEventDate(null);
  };

  const deleteEvent = async (evt: CalendarEvent) => {
    if (evt._caldav) {
      try {
        await getMailClient().delete(
          `/api/calendar/calendars/${encodeURIComponent(evt._caldav.calendarId)}/events/${encodeURIComponent(evt._caldav.eventUid)}`,
          { headers: { 'If-Match': evt._caldav.etag } },
        );
        setCaldavEvents(prev => prev.filter(e => e.id !== evt.id));
        toast.success('Event deleted');
      } catch (err) {
        toast.error(extractError(err));
        return;
      }
    } else {
      saveLocalEvents(localEvents.filter(e => e.id !== evt.id));
    }
    setEditingEvent(null);
  };

  // ── Navigation ──
  const goToday = () => setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const goPrev = () => {
    if (view === 'year') setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1));
    else if (view === 'month') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    }
  };
  const goNext = () => {
    if (view === 'year') setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1));
    else if (view === 'month') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    }
  };

  const monthLabel = view === 'year'
    ? String(currentDate.getFullYear())
    : currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(e => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
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
          <span
            onClick={() => window.dispatchEvent(new Event('open-mail-connect'))}
            className="text-[11px] text-gray-600 cursor-pointer hover:text-gray-900"
            title="Open mail & calendar settings"
          >
            {caldavEnabled
              ? `CalDAV · ${calendars.length} calendar${calendars.length === 1 ? '' : 's'}`
              : 'CalDAV not connected'}
          </span>
          <div className="w-px h-4 bg-gray-200" />
          <div className="flex gap-1">
            {(['year', 'month', 'week'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${view === v ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === 'year' ? (
          <YearView
            year={currentDate.getFullYear()}
            eventsByDate={eventsByDate}
            today={toDateStr(today)}
            onPickMonth={(m) => { setCurrentDate(new Date(currentDate.getFullYear(), m, 1)); setView('month'); }}
            onDayClick={handleDayClick}
          />
        ) : view === 'month' ? (
          <MonthView
            year={currentDate.getFullYear()}
            month={currentDate.getMonth()}
            eventsByDate={eventsByDate}
            today={toDateStr(today)}
            onDayClick={handleDayClick}
            onEventClick={setEditingEvent}
            onToggleTodo={toggleTodoDone}
          />
        ) : (
          <WeekView
            currentDate={currentDate}
            eventsByDate={eventsByDate}
            today={toDateStr(today)}
            onDayClick={handleDayClick}
            onEventClick={setEditingEvent}
            onToggleTodo={toggleTodoDone}
          />
        )}
      </div>

      {editingEvent && (
        <EventEditor
          event={editingEvent}
          isNew={!!newEventDate}
          calendars={calendars}
          onSave={saveEvent}
          onDelete={() => deleteEvent(editingEvent)}
          onClose={() => { setEditingEvent(null); setNewEventDate(null); }}
        />
      )}
    </div>
  );
}

function extractError(err: unknown): string {
  const r = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (r) return r;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

function DayEventBadge({ evt, onEventClick, onToggleTodo, compact = false }: {
  evt: CalendarEvent;
  onEventClick: (e: CalendarEvent) => void;
  onToggleTodo: (id: string) => void;
  compact?: boolean;
}) {
  if (evt._todo && evt._todoId) {
    return compact ? (
      <button onClick={(ev) => { ev.stopPropagation(); onToggleTodo(evt._todoId!); }}
        title={evt.title}
        className={`w-full text-left flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] leading-tight font-medium hover:bg-gray-100 transition-colors ${evt._done ? 'text-gray-400' : 'text-gray-700'}`}>
        <span className="shrink-0">{evt._done ? '☑' : '☐'}</span>
        <span className={`truncate ${evt._done ? 'line-through' : ''}`}>{evt.title || 'Task'}</span>
      </button>
    ) : (
      <button onClick={(ev) => { ev.stopPropagation(); onToggleTodo(evt._todoId!); }}
        className={`w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-100 transition-colors ${evt._done ? 'text-gray-400' : 'text-gray-700'}`}>
        <span className="shrink-0 text-base leading-none">{evt._done ? '☑' : '☐'}</span>
        <span className={`text-xs font-medium truncate ${evt._done ? 'line-through' : ''}`}>{evt.title || 'Task'}</span>
      </button>
    );
  }
  const c = getColor(evt.color);
  return compact ? (
    <button onClick={(ev) => { ev.stopPropagation(); onEventClick(evt); }}
      className={`w-full text-left truncate rounded px-1 py-0.5 text-[10px] leading-tight font-medium ${c.light} hover:opacity-80 transition-opacity`}>
      {!evt.all_day && evt.start_time && <span className="text-[9px] opacity-70 mr-0.5">{evt.start_time}</span>}
      {evt.title || 'Untitled'}
    </button>
  ) : (
    <button onClick={(ev) => { ev.stopPropagation(); onEventClick(evt); }}
      className={`w-full text-left rounded-md px-2 py-1.5 ${c.light} hover:opacity-80 transition-opacity`}>
      <p className="text-xs font-medium truncate">{evt.title || 'Untitled'}</p>
      {!evt.all_day && evt.start_time && (
        <p className="text-[10px] opacity-70">{evt.start_time}{evt.end_time ? ` - ${evt.end_time}` : ''}</p>
      )}
    </button>
  );
}

function MonthView({ year, month, eventsByDate, today, onDayClick, onEventClick, onToggleTodo }: {
  year: number; month: number; eventsByDate: Record<string, CalendarEvent[]>;
  today: string; onDayClick: (d: string) => void; onEventClick: (e: CalendarEvent) => void;
  onToggleTodo: (id: string) => void;
}) {
  const cells = useMemo(() => getMonthDays(year, month), [year, month]);

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAYS.map(d => (
          <div key={d} className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase text-center">{d}</div>
        ))}
      </div>
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
                {dayEvents.slice(0, 3).map(evt => <DayEventBadge key={evt.id} evt={evt} onEventClick={onEventClick} onToggleTodo={onToggleTodo} compact />)}
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

function YearView({ year, eventsByDate, today, onPickMonth, onDayClick }: {
  year: number;
  eventsByDate: Record<string, CalendarEvent[]>;
  today: string;
  onPickMonth: (month: number) => void;
  onDayClick: (dateStr: string) => void;
}) {
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dowShort = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-5 max-w-5xl mx-auto">
        {monthShort.map((label, m) => {
          const cells = getMonthDays(year, m);
          return (
            <div key={m} className="flex flex-col">
              <button onClick={() => onPickMonth(m)}
                className="self-start text-[13px] font-semibold text-blue-600 hover:text-blue-800 mb-1 px-1 -ml-1 rounded transition-colors">
                {label}
              </button>
              <div className="grid grid-cols-7 mb-0.5">
                {dowShort.map((d, i) => (
                  <div key={i} className="text-[9px] font-medium text-gray-400 text-center">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((cell, i) => {
                  const dateStr = toDateStr(cell.date);
                  const isToday = dateStr === today;
                  const hasEvents = !!eventsByDate[dateStr]?.length;
                  return (
                    <button key={i}
                      onClick={(e) => { e.stopPropagation(); onDayClick(dateStr); }}
                      className="relative h-6 flex items-center justify-center group"
                      tabIndex={cell.isCurrentMonth ? 0 : -1}>
                      <span className={`text-[10px] tabular-nums leading-none flex items-center justify-center w-5 h-5 rounded-full transition-colors
                        ${isToday
                          ? 'bg-blue-600 text-white font-semibold'
                          : cell.isCurrentMonth
                            ? 'text-gray-700 group-hover:bg-blue-100'
                            : 'text-gray-300'}`}>
                        {cell.date.getDate()}
                      </span>
                      {hasEvents && cell.isCurrentMonth && !isToday && (
                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />
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

function WeekView({ currentDate, eventsByDate, today, onDayClick, onEventClick, onToggleTodo }: {
  currentDate: Date; eventsByDate: Record<string, CalendarEvent[]>;
  today: string; onDayClick: (d: string) => void; onEventClick: (e: CalendarEvent) => void;
  onToggleTodo: (id: string) => void;
}) {
  const days = useMemo(() => getWeekDays(currentDate), [currentDate]);

  return (
    <div className="h-full flex flex-col">
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
      <div className="grid grid-cols-7 flex-1 overflow-y-auto">
        {days.map(d => {
          const dateStr = toDateStr(d);
          const dayEvents = eventsByDate[dateStr] || [];
          return (
            <div key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className="border-r border-gray-100 px-1.5 py-2 cursor-pointer hover:bg-blue-50/30 transition-colors min-h-[200px]">
              <div className="space-y-1">
                {dayEvents.map(evt => <DayEventBadge key={evt.id} evt={evt} onEventClick={onEventClick} onToggleTodo={onToggleTodo} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventEditor({ event, isNew, calendars, onSave, onDelete, onClose }: {
  event: CalendarEvent;
  isNew: boolean;
  calendars: DavCalendar[];
  onSave: (e: CalendarEvent, targetCalendarId?: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(event.date);
  const [startTime, setStartTime] = useState(event.start_time || '09:00');
  const [endTime, setEndTime] = useState(event.end_time || '10:00');
  const [color, setColor] = useState(event.color);
  const [allDay, setAllDay] = useState(event.all_day ?? false);
  const [description, setDescription] = useState(event.description || '');
  const isFromCaldav = !!event._caldav;
  const [target, setTarget] = useState<string>(isFromCaldav ? event._caldav!.calendarId : 'local');

  const handleSave = () => {
    if (!title.trim()) { toast.error('Event title is required.'); return; }
    const updated: CalendarEvent = {
      ...event,
      title: title.trim(),
      date,
      start_time: allDay ? undefined : startTime,
      end_time: allDay ? undefined : endTime,
      color,
      all_day: allDay,
      description: description.trim() || undefined,
    };
    const targetCal = !isFromCaldav && target !== 'local' ? target : undefined;
    onSave(updated, targetCal);
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
        {(isNew && calendars.length > 0) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Save to</label>
            <select value={target} onChange={e => setTarget(e.target.value)} className={inp}>
              <option value="local">Local (this device only)</option>
              {calendars.map(c => (
                <option key={c.id} value={c.id}>{c.displayName}</option>
              ))}
            </select>
          </div>
        )}
        {isFromCaldav && (
          <p className="text-[11px] text-gray-500">
            From {calendars.find(c => c.id === event._caldav?.calendarId)?.displayName || 'CalDAV'}
          </p>
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
          <button onClick={onDelete} className="text-sm text-red-600 hover:text-red-800 font-medium">Delete</button>
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
