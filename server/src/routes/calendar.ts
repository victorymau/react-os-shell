import { Router } from 'express';
import crypto from 'node:crypto';
import ICAL from 'ical.js';
import { z } from 'zod';
import { AppError, asyncHandler } from '../errors';
import { getClient } from '../services/caldav';
import { requireSession, type AuthedRequest } from '../session';

export const calendarRouter = Router();
calendarRouter.use(requireSession);

function decodeCalendarId(id: string): string {
  return decodeURIComponent(id);
}

function extractEtag(headers: unknown): string {
  if (!headers) return '';
  if (typeof (headers as { get?: (k: string) => string | null }).get === 'function') {
    const h = headers as { get: (k: string) => string | null };
    return h.get('etag') || h.get('ETag') || '';
  }
  const h = headers as Record<string, string | string[] | undefined>;
  const raw = h.etag ?? h.ETag;
  if (Array.isArray(raw)) return raw[0] || '';
  return raw || '';
}

calendarRouter.get(
  '/calendars',
  asyncHandler(async (req, res) => {
    const { session } = req as AuthedRequest;
    if (!session.creds.caldav) {
      res.json({ calendars: [] });
      return;
    }
    const client = await getClient(session);
    const cals = await client.fetchCalendars();
    res.json({
      calendars: cals.map(c => ({
        id: c.url,
        displayName: typeof c.displayName === 'string' ? c.displayName : c.url,
        color: (c as { calendarColor?: string }).calendarColor || null,
        ctag: c.ctag || '',
        readOnly: false,
      })),
    });
  })
);

const eventsQuery = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
});

interface EventOut {
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
  recurrenceId?: string;
}

function vcalendarFromString(data: string): ICAL.Component {
  const jcal = ICAL.parse(data);
  return new ICAL.Component(jcal);
}

function parseEvent(vevent: ICAL.Component): {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  recurrence: string | null;
  status: string;
} {
  const event = new ICAL.Event(vevent);
  const startTime = event.startDate;
  const endTime = event.endDate;
  const allDay = startTime ? startTime.isDate : false;
  const rrule = vevent.getFirstPropertyValue('rrule');
  return {
    uid: event.uid || '',
    summary: event.summary || '',
    description: event.description || null,
    location: event.location || null,
    start: startTime ? startTime.toJSDate().toISOString() : new Date().toISOString(),
    end: endTime ? endTime.toJSDate().toISOString() : new Date().toISOString(),
    allDay,
    recurrence: rrule ? (rrule as ICAL.Recur).toString() : null,
    status: (vevent.getFirstPropertyValue('status') as string) || 'confirmed',
  };
}

function expandRecurring(vevent: ICAL.Component, rangeStart: Date, rangeEnd: Date, etag: string, url: string): EventOut[] {
  const event = new ICAL.Event(vevent);
  if (!event.isRecurring()) {
    const parsed = parseEvent(vevent);
    const startMs = new Date(parsed.start).getTime();
    const endMs = new Date(parsed.end).getTime();
    if (endMs < rangeStart.getTime() || startMs > rangeEnd.getTime()) return [];
    return [{ ...parsed, etag, url }];
  }
  const out: EventOut[] = [];
  const iter = event.iterator();
  let next: ICAL.Time | null = iter.next();
  let safety = 0;
  while (next && safety < 1000) {
    safety += 1;
    const occStart = next.toJSDate();
    if (occStart > rangeEnd) break;
    const details = event.getOccurrenceDetails(next);
    const occEndDate = details.endDate.toJSDate();
    if (occEndDate >= rangeStart) {
      out.push({
        uid: event.uid || '',
        etag,
        url,
        summary: event.summary || '',
        description: event.description || null,
        location: event.location || null,
        start: occStart.toISOString(),
        end: occEndDate.toISOString(),
        allDay: next.isDate,
        recurrence: (vevent.getFirstPropertyValue('rrule') as ICAL.Recur)?.toString() || null,
        status: (vevent.getFirstPropertyValue('status') as string) || 'confirmed',
        recurrenceId: occStart.toISOString(),
      });
    }
    next = iter.next();
  }
  return out;
}

calendarRouter.get(
  '/calendars/:id/events',
  asyncHandler(async (req, res) => {
    const id = decodeCalendarId(req.params.id);
    const { start, end } = eventsQuery.parse(req.query);
    const rangeStart = new Date(start);
    const rangeEnd = new Date(end);
    const { session } = req as AuthedRequest;
    const client = await getClient(session);
    const cals = await client.fetchCalendars();
    const calendar = cals.find(c => c.url === id);
    if (!calendar) throw new AppError(404, 'NOT_FOUND', `Calendar not found: ${id}`);
    const objects = await client.fetchCalendarObjects({ calendar, timeRange: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() } });
    const events: EventOut[] = [];
    for (const obj of objects) {
      if (!obj.data) continue;
      try {
        const vcal = vcalendarFromString(obj.data as string);
        const vevents = vcal.getAllSubcomponents('vevent');
        for (const vevent of vevents) {
          events.push(...expandRecurring(vevent, rangeStart, rangeEnd, obj.etag || '', obj.url));
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Failed to parse calendar object', obj.url, err);
      }
    }
    res.json({ events });
  })
);

const eventInput = z.object({
  summary: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  allDay: z.boolean().optional().default(false),
  recurrence: z.string().optional(),
});

function buildVcalendar(input: z.infer<typeof eventInput>, uid: string): string {
  const vcalendar = new ICAL.Component(['vcalendar', [], []]);
  vcalendar.updatePropertyWithValue('prodid', '-//react-os-shell//EN');
  vcalendar.updatePropertyWithValue('version', '2.0');
  const vevent = new ICAL.Component('vevent');
  vevent.updatePropertyWithValue('uid', uid);
  vevent.updatePropertyWithValue('summary', input.summary);
  if (input.description) vevent.updatePropertyWithValue('description', input.description);
  if (input.location) vevent.updatePropertyWithValue('location', input.location);
  const startTime = input.allDay
    ? ICAL.Time.fromDateString(input.start.slice(0, 10))
    : ICAL.Time.fromJSDate(new Date(input.start), true);
  const endTime = input.allDay
    ? ICAL.Time.fromDateString(input.end.slice(0, 10))
    : ICAL.Time.fromJSDate(new Date(input.end), true);
  vevent.addPropertyWithValue('dtstart', startTime);
  vevent.addPropertyWithValue('dtend', endTime);
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true));
  if (input.recurrence) {
    try {
      vevent.updatePropertyWithValue('rrule', ICAL.Recur.fromString(input.recurrence));
    } catch {
      // ignore malformed rrule
    }
  }
  vcalendar.addSubcomponent(vevent);
  return vcalendar.toString();
}

calendarRouter.post(
  '/calendars/:id/events',
  asyncHandler(async (req, res) => {
    const id = decodeCalendarId(req.params.id);
    const input = eventInput.parse(req.body);
    const { session } = req as AuthedRequest;
    const client = await getClient(session);
    const cals = await client.fetchCalendars();
    const calendar = cals.find(c => c.url === id);
    if (!calendar) throw new AppError(404, 'NOT_FOUND', `Calendar not found: ${id}`);
    const uid = crypto.randomUUID();
    const iCalString = buildVcalendar(input, uid);
    const result = await client.createCalendarObject({ calendar, filename: `${uid}.ics`, iCalString });
    const etag = extractEtag(result.headers);
    res.json({ uid, etag, url: result.url || '' });
  })
);

calendarRouter.put(
  '/calendars/:id/events/:uid',
  asyncHandler(async (req, res) => {
    const id = decodeCalendarId(req.params.id);
    const eventUid = req.params.uid;
    const ifMatch = req.header('if-match');
    if (!ifMatch) throw new AppError(400, 'IF_MATCH_REQUIRED', 'If-Match header required for updates');
    const input = eventInput.parse(req.body);
    const { session } = req as AuthedRequest;
    const client = await getClient(session);
    const cals = await client.fetchCalendars();
    const calendar = cals.find(c => c.url === id);
    if (!calendar) throw new AppError(404, 'NOT_FOUND', `Calendar not found: ${id}`);
    const objects = await client.fetchCalendarObjects({ calendar });
    const existing = objects.find(o => {
      try {
        const comp = vcalendarFromString(o.data as string);
        const ve = comp.getFirstSubcomponent('vevent');
        return ve?.getFirstPropertyValue('uid') === eventUid;
      } catch { return false; }
    });
    if (!existing) throw new AppError(404, 'NOT_FOUND', `Event ${eventUid} not found`);
    if (existing.etag !== ifMatch) {
      throw new AppError(409, 'ETAG_MISMATCH', 'Event was modified elsewhere');
    }
    const iCalString = buildVcalendar(input, eventUid);
    const result = await client.updateCalendarObject({
      calendarObject: { url: existing.url, data: iCalString, etag: existing.etag },
    });
    const newEtag = extractEtag(result.headers);
    res.json({ uid: eventUid, etag: newEtag, url: existing.url });
  })
);

calendarRouter.delete(
  '/calendars/:id/events/:uid',
  asyncHandler(async (req, res) => {
    const id = decodeCalendarId(req.params.id);
    const eventUid = req.params.uid;
    const ifMatch = req.header('if-match');
    if (!ifMatch) throw new AppError(400, 'IF_MATCH_REQUIRED', 'If-Match header required for deletes');
    const { session } = req as AuthedRequest;
    const client = await getClient(session);
    const cals = await client.fetchCalendars();
    const calendar = cals.find(c => c.url === id);
    if (!calendar) throw new AppError(404, 'NOT_FOUND', `Calendar not found: ${id}`);
    const objects = await client.fetchCalendarObjects({ calendar });
    const existing = objects.find(o => {
      try {
        const comp = vcalendarFromString(o.data as string);
        const ve = comp.getFirstSubcomponent('vevent');
        return ve?.getFirstPropertyValue('uid') === eventUid;
      } catch { return false; }
    });
    if (!existing) throw new AppError(404, 'NOT_FOUND', `Event ${eventUid} not found`);
    if (existing.etag !== ifMatch) throw new AppError(409, 'ETAG_MISMATCH', 'Event was modified elsewhere');
    await client.deleteCalendarObject({ calendarObject: { url: existing.url, etag: existing.etag } });
    res.status(204).end();
  })
);
