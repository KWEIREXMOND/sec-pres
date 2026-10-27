'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import type { AttendanceExecutive, AttendanceSignInData } from '@/lib/shared-types';
import { apiPost } from '@/lib/api';
import { useApiData } from '@/lib/hooks';
import { useRealtime, useToast } from '@/components/providers';
import { formatDateTime, titleCase, truncate } from '@/lib/format';
import { Alert, Badge, Button, Card, EmptyState, Input, SectionHeader, Select, Spinner, StatusBadge } from '@/components/ui';

const statusOptions: Array<{ value: AttendanceExecutive['attendance']; label: string }> = [
  { value: 'present', label: 'Sign in' },
  { value: 'absent', label: 'Absent' },
  { value: 'apology', label: 'Apology' },
  { value: 'unknown', label: 'Reset' },
];

export function AttendanceSignInPanel({ canManage }: { canManage: boolean }) {
  const { showToast } = useToast();
  const { refresh } = useRealtime();
  const [meetingId, setMeetingId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const query = meetingId ? `?meetingId=${encodeURIComponent(meetingId)}` : '';
  const { data, loading, error, refetch } = useApiData<AttendanceSignInData>(`/attendance/sign-in${query}`);

  useEffect(() => {
    if (!meetingId && data?.selectedMeetingId) setMeetingId(data.selectedMeetingId);
  }, [data?.selectedMeetingId, meetingId]);

  const signIn = async (executive: AttendanceExecutive, attendance: AttendanceExecutive['attendance']) => {
    if (!data?.selectedMeetingId) return;
    setSaving(executive.id);
    try {
      const result = await apiPost<{ message: string }>('/attendance/sign-in', {
        meetingId: data.selectedMeetingId,
        userId: executive.id,
        attendance,
        note: note.trim(),
      });
      showToast({ title: 'Attendance updated', description: result.message, tone: 'success' });
      setNote('');
      await refetch();
      await refresh();
    } catch (err) {
      showToast({ title: 'Attendance could not be saved', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const selectedMeeting = data?.meetings.find((meeting) => meeting.id === data.selectedMeetingId);

  return (
    <Card id="attendance-sign-in" className="p-5">
      <SectionHeader
        title={canManage ? 'Executive meeting attendance sign-in' : 'Live attendance monitoring'}
        description={canManage
          ? 'Sign in SRC executives for the selected meeting. The President and administration are notified automatically.'
          : 'Recent executive sign-ins are recorded by the Secretariat and visible to leadership in real time.'}
        action={<Badge tone={data?.canSignIn ? 'green' : 'navy'}><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Monitored</Badge>}
      />

      {loading && !data ? <Spinner label="Loading attendance records" /> : null}
      {error ? <Alert tone="error" action={<Button size="sm" variant="outline" onClick={refetch}>Retry</Button>}>{error}</Alert> : null}

      {data && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div>
              <label className="field-label" htmlFor="attendance-meeting">Meeting</label>
              <Select
                id="attendance-meeting"
                value={data.selectedMeetingId}
                onChange={(event) => setMeetingId(event.target.value)}
              >
                {data.meetings.length === 0 && <option value="">No meetings available</option>}
                {data.meetings.map((meeting) => (
                  <option key={meeting.id} value={meeting.id}>
                    {meeting.title} • {formatDateTime(meeting.starts_at)} • {meeting.venue || 'Venue TBC'}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void refetch()}>Refresh</Button>
            </div>
          </div>

          {selectedMeeting && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <div className="font-semibold text-navy-900">{selectedMeeting.title}</div>
              <div className="mt-1">{formatDateTime(selectedMeeting.starts_at)} • {selectedMeeting.venue || 'Venue to be confirmed'}</div>
              <div className="mt-1">Monitored by: {data.monitors.length ? data.monitors.join(', ') : 'President and administration'}</div>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <Badge tone="navy"><Users className="mr-1 inline h-3.5 w-3.5" />{data.summary.total} executives</Badge>
            <Badge tone="green"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{data.summary.present} present</Badge>
            <Badge tone="red"><UserX className="mr-1 inline h-3.5 w-3.5" />{data.summary.absent} absent</Badge>
            <Badge tone="gold"><Clock3 className="mr-1 inline h-3.5 w-3.5" />{data.summary.apology} apologies</Badge>
            <Badge tone="muted"><UserCheck className="mr-1 inline h-3.5 w-3.5" />{data.summary.pending} pending</Badge>
          </div>

          {canManage && data.executives.length > 0 && (
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div>
                <label className="field-label" htmlFor="attendance-note">Optional sign-in note</label>
                <Input id="attendance-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Signed in at the SRC office" />
              </div>
              <div className="flex items-end text-xs text-slate-500">Applied to the next sign-in only.</div>
            </div>
          )}

          {data.meetings.length === 0 ? (
            <EmptyState title="No meetings available" description="Create a meeting before signing executives in." icon={<Users className="h-6 w-6" />} />
          ) : canManage ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="hidden grid-cols-[1fr_120px_1fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 md:grid">
                <span>Executive</span><span>Current</span><span>Actions</span>
              </div>
              <div className="divide-y divide-slate-100">
                {data.executives.map((executive) => (
                  <div key={executive.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_120px_1fr] md:items-center">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800">{executive.name}</div>
                      <div className="truncate text-xs text-slate-400">{executive.position || titleCase(executive.role)}</div>
                      {executive.check_in_at && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          {formatDateTime(executive.check_in_at)}{executive.signed_in_by_name ? ` • by ${executive.signed_in_by_name}` : ''}
                          {executive.signed_in_note ? ` • ${truncate(executive.signed_in_note, 60)}` : ''}
                        </div>
                      )}
                    </div>
                    <div><StatusBadge status={executive.attendance} /></div>
                    <div className="flex flex-wrap gap-1.5">
                      {statusOptions.map((option) => (
                        <Button
                          key={option.value}
                          size="sm"
                          variant={executive.attendance === option.value ? 'gold' : 'outline'}
                          loading={saving === executive.id && option.value !== 'unknown'}
                          disabled={saving === executive.id}
                          onClick={() => void signIn(executive, option.value)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {data.recentSignIns.length === 0 ? (
                <EmptyState title="No sign-ins yet" description="Executive attendance will appear here as soon as the Secretary records it." icon={<Clock3 className="h-6 w-6" />} />
              ) : data.recentSignIns.map((item) => (
                <Link key={item.id} href={`/workspace/meetings/${item.meeting_id}`} className="record-row">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800">{item.user_name} • {titleCase(item.attendance)}</div>
                    <div className="text-xs text-slate-400">{item.meeting_title} • {formatDateTime(item.check_in_at)}{item.signed_in_by_name ? ` • recorded by ${item.signed_in_by_name}` : ''}</div>
                  </div>
                  <Badge tone="green">Verified</Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
