/**
 * Shared date formatting utility.
 *
 * Reads the user's preferred date format from localStorage (`user_date_format`)
 * and formats all dates consistently across the app.
 *
 * Supported formats (numeric, two-digit-year, abbreviated- and full-month):
 *   'DD/MM/YYYY'   — 24/04/2026     'MM/DD/YY'      — 04/24/26
 *   'MM/DD/YYYY'   — 04/24/2026     'YYYY/MM/DD'    — 2026/04/24
 *   'YYYY-MM-DD'   — 2026-04-24     'YYYY.MM.DD'    — 2026.04.24
 *   'DD-MM-YYYY'   — 24-04-2026     'MM-DD-YYYY'    — 04-24-2026
 *   'DD.MM.YYYY'   — 24.04.2026     'DD MMM YYYY'   — 24 Apr 2026
 *   'DD/MM/YY'     — 24/04/26       'MMM DD, YYYY'  — Apr 24, 2026
 *   'DD/MMM/YYYY'  — 24/Apr/2026    'DD MMMM YYYY'  — 24 April 2026
 *   'DD/MMM/YY'    — 24/Apr/26      'MMMM DD, YYYY' — April 24, 2026
 */

export type DateFormatKey =
  | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'DD.MM.YYYY'
  | 'DD/MM/YY' | 'DD/MMM/YYYY' | 'DD/MMM/YY'
  | 'MM/DD/YY' | 'YYYY/MM/DD' | 'YYYY.MM.DD' | 'MM-DD-YYYY'
  | 'DD MMM YYYY' | 'MMM DD, YYYY' | 'DD MMMM YYYY' | 'MMMM DD, YYYY';

export const DATE_FORMAT_OPTIONS: { key: DateFormatKey; example: string }[] = [
  { key: 'DD/MM/YYYY', example: '24/04/2026' },
  { key: 'MM/DD/YYYY', example: '04/24/2026' },
  { key: 'YYYY-MM-DD', example: '2026-04-24' },
  { key: 'DD-MM-YYYY', example: '24-04-2026' },
  { key: 'MM-DD-YYYY', example: '04-24-2026' },
  { key: 'DD.MM.YYYY', example: '24.04.2026' },
  { key: 'YYYY.MM.DD', example: '2026.04.24' },
  { key: 'YYYY/MM/DD', example: '2026/04/24' },
  { key: 'DD/MM/YY', example: '24/04/26' },
  { key: 'MM/DD/YY', example: '04/24/26' },
  { key: 'DD/MMM/YYYY', example: '24/Apr/2026' },
  { key: 'DD/MMM/YY', example: '24/Apr/26' },
  { key: 'DD MMM YYYY', example: '24 Apr 2026' },
  { key: 'MMM DD, YYYY', example: 'Apr 24, 2026' },
  { key: 'DD MMMM YYYY', example: '24 April 2026' },
  { key: 'MMMM DD, YYYY', example: 'April 24, 2026' },
];

/** Month names for the alpha-numeric 'MMM'/'MMMM' formats. */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthAbbr(mm: string): string {
  return MONTH_ABBR[parseInt(mm, 10) - 1] ?? mm;
}

function monthFull(mm: string): string {
  return MONTH_FULL[parseInt(mm, 10) - 1] ?? mm;
}

export function getUserDateFormat(): DateFormatKey {
  return (localStorage.getItem('user_date_format') as DateFormatKey) || 'DD/MM/YYYY';
}

export function setUserDateFormat(fmt: DateFormatKey) {
  localStorage.setItem('user_date_format', fmt);
}

/**
 * Format a date string (YYYY-MM-DD or ISO timestamp) for display.
 * Returns '—' for null/empty values.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  // Parse — handle both "YYYY-MM-DD" and ISO timestamps
  const dateStr = value.includes('T') ? value.split('T')[0] : value;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return value; // fallback if unparseable

  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const yyyy = String(y);

  const fmt = getUserDateFormat();
  switch (fmt) {
    case 'MM/DD/YYYY': return `${mm}/${dd}/${yyyy}`;
    case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`;
    case 'DD-MM-YYYY': return `${dd}-${mm}-${yyyy}`;
    case 'MM-DD-YYYY': return `${mm}-${dd}-${yyyy}`;
    case 'DD.MM.YYYY': return `${dd}.${mm}.${yyyy}`;
    case 'YYYY.MM.DD': return `${yyyy}.${mm}.${dd}`;
    case 'YYYY/MM/DD': return `${yyyy}/${mm}/${dd}`;
    case 'DD/MM/YY':   return `${dd}/${mm}/${yyyy.slice(-2)}`;
    case 'MM/DD/YY':   return `${mm}/${dd}/${yyyy.slice(-2)}`;
    case 'DD/MMM/YYYY': return `${dd}/${monthAbbr(mm)}/${yyyy}`;
    case 'DD/MMM/YY':  return `${dd}/${monthAbbr(mm)}/${yyyy.slice(-2)}`;
    case 'DD MMM YYYY': return `${dd} ${monthAbbr(mm)} ${yyyy}`;
    case 'MMM DD, YYYY': return `${monthAbbr(mm)} ${dd}, ${yyyy}`;
    case 'DD MMMM YYYY': return `${dd} ${monthFull(mm)} ${yyyy}`;
    case 'MMMM DD, YYYY': return `${monthFull(mm)} ${dd}, ${yyyy}`;
    case 'DD/MM/YYYY':
    default:           return `${dd}/${mm}/${yyyy}`;
  }
}

/**
 * Format a datetime string (ISO timestamp) for display, including time.
 * Returns '—' for null/empty values.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return value;
  const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const time = dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${formatDate(dateStr)}, ${time}`;
}
