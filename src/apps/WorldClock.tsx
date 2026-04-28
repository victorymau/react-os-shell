import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe, updateMe } from '../api/auth';
import { ALL_TIMEZONES, ClockContent } from '../shell/Layout';

export default function WorldClock() {
  const [now, setNow] = useState(new Date());
  const [adding, setAdding] = useState(false);
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ['my-profile-sidebar'],
    queryFn: () => getMe(),
  });
  const worldClocks: string[] = (profile?.preferences || {}).world_clocks || ['Europe/London', 'Asia/Shanghai', 'America/Los_Angeles', 'America/New_York'];

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);

  const fmtTime = (tz: string) => now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const fmtDate = (tz: string) => now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
  const fmtOffset = (tz: string) => {
    const parts = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now);
    return parts.find(p => p.type === 'timeZoneName')?.value || '';
  };

  const saveClocks = (clocks: string[]) => {
    updateMe({ preferences: { world_clocks: clocks } } as any).then(() => {
      queryClient.invalidateQueries({ queryKey: ['my-profile-sidebar'] });
    });
  };

  const addClock = (tz: string) => {
    if (!worldClocks.includes(tz)) saveClocks([...worldClocks, tz]);
    setAdding(false);
  };

  const removeClock = (tz: string) => {
    saveClocks(worldClocks.filter(t => t !== tz));
  };

  const localTz = localStorage.getItem('user_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const availableToAdd = ALL_TIMEZONES.filter(t => t.tz !== localTz && !worldClocks.includes(t.tz));

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <ClockContent localTz={localTz} worldClocks={worldClocks} now={now} fmtTime={fmtTime} fmtDate={fmtDate} fmtOffset={fmtOffset}
        removeClock={removeClock} adding={adding} setAdding={setAdding} addClock={addClock} availableToAdd={availableToAdd} showAdd />
    </div>
  );
}
