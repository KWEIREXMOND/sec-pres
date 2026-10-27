'use client';

export function formatDate(value: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', options || { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(value: string | Date | null | undefined): string {
  return formatDate(value, { hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const rtf = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });
  if (abs < minute) return 'just now';
  if (abs < hour) return rtf.format(Math.round(diff / minute), 'minute');
  if (abs < day) return rtf.format(Math.round(diff / hour), 'hour');
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), 'day');
  return formatDate(value);
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function statusTone(status: string): 'navy' | 'gold' | 'green' | 'red' | 'muted' {
  const value = status.toLowerCase();
  if (['approved', 'completed', 'resolved', 'closed', 'sent', 'answered', 'active', 'delivered', 'confirmed', 'present', 'adopted', 'implemented', 'final'].includes(value)) return 'green';
  if (['pending_approval', 'awaiting_review', 'acknowledged', 'in_progress', 'draft', 'requested', 'scheduled', 'proposed', 'pending'].includes(value)) return 'gold';
  if (['new', 'overdue', 'rejected', 'revisions_requested', 'critical', 'urgent', 'failed', 'escalated', 'inactive'].includes(value)) return 'red';
  if (['archived', 'cancelled', 'unknown', 'not_configured', 'skipped'].includes(value)) return 'muted';
  return 'navy';
}

export function priorityTone(priority: string): 'navy' | 'gold' | 'green' | 'red' | 'muted' {
  if (priority === 'critical' || priority === 'urgent') return 'red';
  if (priority === 'high') return 'gold';
  if (priority === 'normal') return 'navy';
  return 'muted';
}

export function dateInputValue(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function dateTimeLocalValue(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function periodDefaults(kind: 'month' | 'term' | 'year' | 'fortnight' = 'month'): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  if (kind === 'fortnight') start.setDate(start.getDate() - 14);
  else if (kind === 'term') start.setDate(start.getDate() - 90);
  else if (kind === 'year') start.setFullYear(start.getFullYear() - 1);
  else start.setMonth(start.getMonth() - 1);
  return { start: dateInputValue(start), end: dateInputValue(end) };
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function truncate(value: string, max = 120): string {
  if (!value) return '';
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function isOverdue(value: string | Date | null | undefined, status?: string): boolean {
  if (!value || status === 'completed' || status === 'closed' || status === 'archived') return false;
  return new Date(value).getTime() < Date.now();
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function safeHref(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value.startsWith('/') || value.startsWith('tel:') || value.startsWith('sms:') || value.startsWith('https://') ? value : undefined;
}
