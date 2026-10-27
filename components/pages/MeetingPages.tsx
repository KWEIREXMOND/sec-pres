'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  MapPin,
  PenLine,
  Send,
  UserPlus,
  Users,
} from 'lucide-react';
import type { DirectoryEntry, DocumentRecord, Meeting, Template } from '@/lib/shared-types';
import { apiGet, apiPatch, apiPost, downloadApiFile } from '@/lib/api';
import { useApiData } from '@/lib/hooks';
import { useAuth, useRealtime, useToast, useWorkspace } from '@/components/providers';
import { dateTimeLocalValue, formatDate, formatDateTime, titleCase, truncate } from '@/lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, KeyValue, LinkButton, Modal, PageHeader, SearchInput, SectionHeader, Select, Spinner, StatusBadge, TableWrap, Tabs, Textarea } from '@/components/ui';

function TemplatePicker({ type, values, onApply }: { type: Template['type']; values: Record<string, string>; onApply: (content: string) => void }) {
  const { data } = useApiData<{ templates: Template[] }>('/templates');
  const { showToast } = useToast();
  const [templateId, setTemplateId] = useState('');
  const [loading, setLoading] = useState(false);
  const templates = (data?.templates || []).filter((template) => template.type === type);

  const apply = async () => {
    if (!templateId) return;
    setLoading(true);
    try {
      const result = await apiPost<{ content: string }>('/templates/render', { templateId, values });
      onApply(result.content);
      showToast({ title: 'Template inserted', description: 'Review and edit the inserted text before saving.', tone: 'success' });
    } catch (error) {
      showToast({ title: 'Template could not be inserted', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-end">
      <Field label={`Insert ${type} template`} className="flex-1">
        <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          <option value="">Choose a reusable template</option>
          {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </Select>
      </Field>
      <Button variant="outline" loading={loading} disabled={!templateId} onClick={() => void apply()}>Insert into editor</Button>
    </div>
  );
}

function CreateMeetingModal({ open, onClose, initialRequest }: { open: boolean; onClose: () => void; initialRequest: boolean }) {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const router = useRouter();
  const { data: directory } = useApiData<{ people: DirectoryEntry[] }>('/directory', { enabled: open });
  const [title, setTitle] = useState('');
  const [meetingType, setMeetingType] = useState('school_executive');
  const [startsAt, setStartsAt] = useState(dateTimeLocalValue(new Date(Date.now() + 86400000)));
  const [venue, setVenue] = useState('');
  const [agenda, setAgenda] = useState('');
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const canManage = Boolean(user?.permissions.includes('manage_meetings') || user?.role === 'system_admin');
  const status = initialRequest || !canManage ? 'requested' : 'scheduled';

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setMeetingType('school_executive');
    setStartsAt(dateTimeLocalValue(new Date(Date.now() + 86400000)));
    setVenue('');
    setAgenda('');
    setAttendeeIds([]);
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeWorkspace) return;
    setSubmitting(true);
    try {
      const result = await apiPost<{ meeting: Meeting; message: string }>('/meetings', {
        organizationId: activeWorkspace.id,
        title,
        meetingType,
        status,
        startsAt,
        venue: venue || 'To be confirmed',
        chairperson: user?.name || '',
        agenda,
        attendeeIds,
      });
      showToast({ title: status === 'requested' ? 'Meeting request sent' : 'Meeting created', description: result.message, tone: 'success' });
      onClose();
      router.push(`/workspace/meetings/${result.meeting.id}`);
    } catch (error) {
      showToast({ title: 'Meeting could not be saved', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={status === 'requested' ? 'Create meeting request' : 'Create and schedule meeting'}
      description="All meeting fields are saved to the workspace database and attendees are notified."
      size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="create-meeting-form" loading={submitting} icon={<CalendarPlus className="h-4 w-4" />}>{status === 'requested' ? 'Send request' : 'Create meeting'}</Button></>}
    >
      <form id="create-meeting-form" onSubmit={submit} className="space-y-4">
        <div className="form-grid">
          <Field label="Meeting title" htmlFor="meeting-title" required><Input id="meeting-title" value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
          <Field label="Meeting type" htmlFor="meeting-type" required>
            <Select id="meeting-type" value={meetingType} onChange={(event) => setMeetingType(event.target.value)} required>
              <option value="school_executive">School executive</option>
              <option value="zonal_executive">Zonal executive</option>
              <option value="general">General SRC meeting</option>
              <option value="committee">Committee meeting</option>
              <option value="emergency">Emergency meeting</option>
              <option value="programme">Programme</option>
            </Select>
          </Field>
          <Field label="Date and time" htmlFor="meeting-starts" required><Input id="meeting-starts" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></Field>
          <Field label="Venue" htmlFor="meeting-venue" required><Input id="meeting-venue" value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Conference room or virtual link" required /></Field>
        </div>
        <Field label="Agenda" htmlFor="meeting-agenda">
          <Textarea id="meeting-agenda" rows={5} value={agenda} onChange={(event) => setAgenda(event.target.value)} placeholder="Enter agenda items manually" />
        </Field>
        <Field label="Attendees" hint="Select authorized members of the current workspace.">
          <div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
            {(directory?.people || []).map((person) => (
              <label key={person.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={attendeeIds.includes(person.id)} onChange={(event) => setAttendeeIds((current) => event.target.checked ? [...current, person.id] : current.filter((value) => value !== person.id))} />
                <span className="truncate">{person.name} <span className="text-xs text-slate-400">• {person.position}</span></span>
              </label>
            ))}
            {!directory?.people?.length && <div className="text-sm text-slate-400">No members available.</div>}
          </div>
        </Field>
      </form>
    </Modal>
  );
}

export function MeetingsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [initialRequest, setInitialRequest] = useState(false);
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (type) params.set('type', type);
  const { data, loading, error, refetch } = useApiData<{ meetings: Meeting[] }>(`/meetings${params.toString() ? `?${params}` : ''}`);
  const canCreate = Boolean(user?.permissions.includes('manage_meetings') || user?.permissions.includes('create_meeting_request') || user?.role === 'system_admin');

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('create') === '1' || query.get('request') === '1') {
      setInitialRequest(query.get('request') === '1');
      setCreateOpen(true);
    }
  }, []);

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Meeting management"
        title="Meetings & minutes"
        description="Schedule meetings, prepare agendas, record attendance, document resolutions and submit minutes for approval."
        actions={canCreate && <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => { setInitialRequest(false); setCreateOpen(true); }}>Create meeting</Button>}
      />
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_200px_auto]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search title, agenda, minutes or venue" />
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {['requested', 'scheduled', 'completed', 'cancelled', 'archived'].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
          </Select>
          <Select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter by type">
            <option value="">All types</option>
            {['school_executive', 'zonal_executive', 'general', 'committee', 'emergency', 'programme'].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
          </Select>
          <Button variant="outline" onClick={refetch}>Refresh</Button>
        </div>
      </Card>
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <Spinner label="Loading meetings" /> : (
        <Card className="overflow-hidden">
          {(data?.meetings || []).length === 0 ? <EmptyState title="No meetings found" description="Create a meeting or adjust your filters." icon={<Users className="h-6 w-6" />} /> : (
            <TableWrap className="rounded-none border-0">
              <table className="data-table">
                <thead><tr><th>Meeting</th><th>Type</th><th>Date</th><th>Venue</th><th>Status</th><th>Minutes</th><th /></tr></thead>
                <tbody>
                  {(data?.meetings || []).map((meeting) => (
                    <tr key={meeting.id} className="clickable" onClick={() => window.location.href = `/workspace/meetings/${meeting.id}`}>
                      <td><div className="font-semibold text-slate-800">{meeting.title}</div><div className="text-xs text-slate-400">Chair: {meeting.chairperson || '—'}</div></td>
                      <td>{titleCase(meeting.meeting_type)}</td>
                      <td>{formatDateTime(meeting.starts_at)}</td>
                      <td>{meeting.venue}</td>
                      <td><StatusBadge status={meeting.status} /></td>
                      <td><StatusBadge status={meeting.minutes_status} /></td>
                      <td><Link href={`/workspace/meetings/${meeting.id}`} onClick={(event) => event.stopPropagation()} className="text-xs font-semibold text-navy-700 hover:underline">Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      )}
      <CreateMeetingModal open={createOpen} onClose={() => setCreateOpen(false)} initialRequest={initialRequest} />
    </div>
  );
}

export function MeetingDetailPage({ id }: { id: string }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { refresh } = useRealtime();
  const { data, loading, error, refetch } = useApiData<{ meeting: Meeting }>(`/meetings/${id}`);
  const { data: directory } = useApiData<{ people: DirectoryEntry[] }>(`/directory`);
  const { data: documentData } = useApiData<{ documents: DocumentRecord[] }>(`/documents?meetingId=${encodeURIComponent(id)}`);
  const [tab, setTab] = useState('overview');
  const [agenda, setAgenda] = useState('');
  const [discussions, setDiscussions] = useState('');
  const [minutes, setMinutes] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [attendeeOpen, setAttendeeOpen] = useState(false);
  const [resolution, setResolution] = useState({ title: '', description: '', movedBy: '', secondedBy: '', dueDate: '', createTask: false, taskAssigneeId: '', taskDueDate: '' });
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  const meeting = data?.meeting;
  const canManage = Boolean(user?.permissions.includes('manage_meetings') || user?.role === 'system_admin');
  const minutesDocument = (documentData?.documents || []).find((doc) => doc.kind === 'minutes' && doc.status === 'approved') || (documentData?.documents || []).find((doc) => doc.kind === 'minutes');

  useEffect(() => {
    if (!meeting) return;
    setAgenda(meeting.agenda || '');
    setDiscussions(meeting.discussions || '');
    setMinutes(meeting.minutes || '');
  }, [meeting]);

  const templateValues = useMemo(() => ({
    meeting_title: meeting?.title || '',
    date: meeting ? formatDate(meeting.starts_at, { day: 'numeric', month: 'long', year: 'numeric' }) : '',
    time: meeting ? formatDate(meeting.starts_at, { hour: '2-digit', minute: '2-digit' }) : '',
    venue: meeting?.venue || '',
    chairperson: meeting?.chairperson || '',
    attendees: (meeting?.attendees || []).map((item) => item.user_name).filter(Boolean).join(', '),
    apologies: (meeting?.attendees || []).filter((item) => item.rsvp_status === 'apology').map((item) => item.user_name).join(', '),
    resolutions: (meeting?.resolutions || []).map((item) => item.title).join('\n'),
    action_items: (meeting?.tasks || []).map((item) => `${item.title} — ${item.assignee_name} — ${formatDate(item.due_date)}`).join('\n'),
    signatory: user?.name || '',
    position: user?.position || '',
  }), [meeting, user]);

  if (loading) return <Spinner label="Loading meeting record" />;
  if (error) return <Alert tone="error" action={<Button variant="outline" size="sm" onClick={refetch}>Retry</Button>}>{error}</Alert>;
  if (!meeting) return <EmptyState title="Meeting not found" action={<LinkButton href="/workspace/meetings" variant="outline">Back to meetings</LinkButton>} />;

  const save = async (fields: Record<string, unknown>, label: string) => {
    setSaving(label);
    try {
      await apiPatch(`/meetings/${id}`, fields);
      showToast({ title: `${label} saved`, tone: 'success' });
      await refetch();
      await refresh();
    } catch (err) {
      showToast({ title: 'Save failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const submitMinutes = async () => {
    setSaving('minutes-submit');
    try {
      const result = await apiPost<{ message: string; documentId: string }>(`/meetings/${id}/submit-minutes`);
      showToast({ title: 'Minutes submitted', description: result.message, tone: 'success' });
      await refetch();
      await refresh();
    } catch (err) {
      showToast({ title: 'Submission failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const createResolution = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving('resolution');
    try {
      await apiPost(`/meetings/${id}/resolutions`, {
        ...resolution,
        dueDate: resolution.dueDate || null,
        taskAssigneeId: resolution.createTask ? resolution.taskAssigneeId || null : null,
        taskDueDate: resolution.createTask ? resolution.taskDueDate || null : null,
      });
      showToast({ title: 'Resolution saved', description: resolution.createTask ? 'Resolution and action item saved.' : 'Resolution recorded.', tone: 'success' });
      setResolutionOpen(false);
      setResolution({ title: '', description: '', movedBy: '', secondedBy: '', dueDate: '', createTask: false, taskAssigneeId: '', taskDueDate: '' });
      await refetch();
      await refresh();
    } catch (err) {
      showToast({ title: 'Resolution failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const updateAttendance = async (userId: string, rsvpStatus?: string, attendance?: string) => {
    setSaving(`attendance-${userId}`);
    try {
      await apiPost(`/meetings/${id}/attendance`, { userId, rsvpStatus, attendance });
      await refetch();
    } catch (err) {
      showToast({ title: 'Attendance update failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const addAttendees = async () => {
    setSaving('attendees');
    try {
      await apiPost(`/meetings/${id}/attendance`, { attendeeIds: selectedAttendees });
      setSelectedAttendees([]);
      setAttendeeOpen(false);
      showToast({ title: 'Attendees added', description: 'Invitations were saved and notified.', tone: 'success' });
      await refetch();
    } catch (err) {
      showToast({ title: 'Attendees could not be added', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const archive = async () => {
    await save({ status: meeting.status === 'archived' ? 'scheduled' : 'archived' }, 'Meeting status');
  };

  return (
    <div className="stack">
      <PageHeader
        eyebrow={`${titleCase(meeting.meeting_type)} • ${meeting.venue}`}
        title={meeting.title}
        description={`${formatDateTime(meeting.starts_at)} • Chair: ${meeting.chairperson || 'Not set'}`}
        actions={<><LinkButton href="/workspace/meetings" variant="outline" icon={<ArrowLeft className="h-4 w-4" />}>All meetings</LinkButton>{minutesDocument?.status === 'approved' && <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => void downloadApiFile(`/documents/${minutesDocument.id}/pdf`, `${minutesDocument.reference}.pdf`)}>Download minutes PDF</Button>}</>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={meeting.status} />
        <StatusBadge status={meeting.minutes_status} />
        <Badge tone="navy"><Users className="h-3 w-3" />{meeting.attendees?.length || 0} attendees</Badge>
        <Badge tone="gold"><ClipboardCheck className="h-3 w-3" />{meeting.resolutions?.length || 0} resolutions</Badge>
        {canManage && <Button size="sm" variant="outline" onClick={() => void archive()}>{meeting.status === 'archived' ? 'Restore meeting' : 'Archive meeting'}</Button>}
      </div>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'agenda', label: 'Agenda' },
          { id: 'minutes', label: 'Minutes' },
          { id: 'resolutions', label: 'Resolutions', count: meeting.resolutions?.length || 0 },
          { id: 'attendance', label: 'Attendance', count: meeting.attendees?.length || 0 },
          { id: 'tasks', label: 'Action items', count: meeting.tasks?.length || 0 },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <SectionHeader title="Meeting overview" description="Saved meeting information and current record state." />
            <div className="mt-4"><KeyValue items={[
              { label: 'Meeting type', value: titleCase(meeting.meeting_type) },
              { label: 'Start', value: formatDateTime(meeting.starts_at) },
              { label: 'Venue', value: meeting.venue },
              { label: 'Chairperson', value: meeting.chairperson },
              { label: 'Created', value: formatDateTime(meeting.created_at) },
              { label: 'Last updated', value: formatDateTime(meeting.updated_at) },
            ]} /></div>
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-navy-900">Prepared agenda</h3>
              <div className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{meeting.agenda || 'No agenda has been saved yet.'}</div>
            </div>
          </Card>
          <Card className="p-5">
            <SectionHeader title="Meeting workflow" description="Manual, user-controlled tools only." />
            <div className="mt-4 space-y-2">
              <Button fullWidth variant="outline" onClick={() => setTab('agenda')} icon={<PenLine className="h-4 w-4" />}>Edit agenda</Button>
              <Button fullWidth variant="outline" onClick={() => setTab('minutes')} icon={<FileText className="h-4 w-4" />}>Record minutes</Button>
              <Button fullWidth variant="outline" onClick={() => setResolutionOpen(true)} icon={<ClipboardCheck className="h-4 w-4" />}>Record resolution</Button>
              <Button fullWidth variant="outline" onClick={() => setAttendeeOpen(true)} icon={<UserPlus className="h-4 w-4" />}>Add attendees</Button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'agenda' && (
        <Card className="p-5">
          <SectionHeader title="Manual agenda editor" description="Insert a reusable template or write the agenda directly." action={canManage ? <Button loading={saving === 'agenda'} onClick={() => void save({ agenda }, 'Agenda')}>Save agenda</Button> : undefined} />
          <div className="mt-4 space-y-4">
            <TemplatePicker type="agenda" values={templateValues} onApply={setAgenda} />
            <Textarea rows={16} value={agenda} onChange={(event) => setAgenda(event.target.value)} placeholder="1. Opening and roll call..." disabled={!canManage} />
          </div>
        </Card>
      )}

      {tab === 'minutes' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="p-5 xl:col-span-2">
            <SectionHeader title="Manual minutes editor" description="Record discussions and minutes from the meeting. No automated content is created." />
            <div className="mt-4 space-y-4">
              <TemplatePicker type="minutes" values={templateValues} onApply={setMinutes} />
              <Field label="Discussion notes" htmlFor="discussion-notes">
                <Textarea id="discussion-notes" rows={5} value={discussions} onChange={(event) => setDiscussions(event.target.value)} disabled={!canManage} placeholder="Record discussions manually" />
              </Field>
              <Field label="Minutes content" htmlFor="minutes-content">
                <Textarea id="minutes-content" rows={14} value={minutes} onChange={(event) => setMinutes(event.target.value)} disabled={!canManage} placeholder="Write or paste the minutes here" />
              </Field>
              {canManage && <Button loading={saving === 'minutes'} onClick={() => void save({ discussions, minutes, minutesStatus: minutes.trim() ? 'draft' : 'not_started' }, 'Minutes')}>Save minutes</Button>}
            </div>
          </Card>
          <div className="space-y-4">
            <Card className="p-5">
              <SectionHeader title="Approval status" description="Submit minutes for presidential review." />
              <div className="mt-4 space-y-3">
                <StatusBadge status={meeting.minutes_status} />
                {minutesDocument && <div className="rounded-xl border border-slate-200 p-3 text-sm"><div className="font-medium text-slate-700">{minutesDocument.title}</div><div className="mt-1 text-xs text-slate-400">{minutesDocument.reference} • <StatusBadge status={minutesDocument.status} /></div></div>}
                {canManage && <Button fullWidth variant="gold" loading={saving === 'minutes-submit'} icon={<Send className="h-4 w-4" />} onClick={() => void submitMinutes()} disabled={!minutes.trim()}>Submit minutes for approval</Button>}
                {minutesDocument?.status === 'approved' ? (
                  <Button fullWidth variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => void downloadApiFile(`/documents/${minutesDocument.id}/pdf`, `${minutesDocument.reference}.pdf`)}>Download approved minutes PDF</Button>
                ) : (
                  <p className="text-xs text-slate-400">PDF export is available after presidential approval.</p>
                )}
              </div>
            </Card>
            <Card className="p-5">
              <SectionHeader title="Resolutions summary" description="Saved decisions for this meeting." />
              <div className="mt-4 space-y-2">
                {(meeting.resolutions || []).length === 0 && <div className="text-sm text-slate-400">No resolutions recorded.</div>}
                {(meeting.resolutions || []).map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-xs"><div className="font-semibold text-slate-700">{item.title}</div><div className="text-slate-400">{item.reference}</div></div>)}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'resolutions' && (
        <div className="space-y-4">
          <div className="flex justify-end">{canManage && <Button icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => setResolutionOpen(true)}>Record resolution</Button>}</div>
          <Card className="overflow-hidden">
            {(meeting.resolutions || []).length === 0 ? <EmptyState title="No resolutions recorded" description="Use the standard resolution form to record decisions and optional tasks." icon={<ClipboardCheck className="h-6 w-6" />} /> : (
              <TableWrap className="rounded-none border-0">
                <table className="data-table"><thead><tr><th>Reference</th><th>Resolution</th><th>Moved / seconded</th><th>Due</th><th>Status</th></tr></thead><tbody>
                  {(meeting.resolutions || []).map((item) => <tr key={item.id}><td>{item.reference}</td><td><div className="font-semibold text-slate-800">{item.title}</div><div className="text-xs text-slate-400">{truncate(item.description, 100)}</div></td><td>{item.moved_by || '—'} / {item.seconded_by || '—'}</td><td>{item.due_date ? formatDate(item.due_date) : '—'}</td><td><StatusBadge status={item.status} /></td></tr>)}
                </tbody></table>
              </TableWrap>
            )}
          </Card>
        </div>
      )}

      {tab === 'attendance' && (
        <Card className="p-5">
          <SectionHeader title="Attendance and apologies" description="Members can confirm attendance; the Secretariat records actual attendance." action={canManage ? <Button variant="outline" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAttendeeOpen(true)}>Add attendees</Button> : undefined} />
          <div className="mt-4 overflow-x-auto">
            <table className="data-table min-w-[900px]"><thead><tr><th>Member</th><th>Position</th><th>RSVP</th><th>Attendance</th><th>Recorded by</th><th>Actions</th></tr></thead><tbody>
              {(meeting.attendees || []).map((attendee) => (
                <tr key={attendee.id}>
                  <td><div className="font-semibold text-slate-800">{attendee.user_name}</div><div className="text-xs text-slate-400">{titleCase(attendee.user_role || '')}</div></td>
                  <td>{attendee.user_position || '—'}</td>
                  <td><StatusBadge status={attendee.rsvp_status} /></td>
                  <td><StatusBadge status={attendee.attendance} /></td>
                  <td>
                    <div className="text-xs text-slate-600">{attendee.signed_in_by_name || (attendee.check_in_at ? 'Secretariat' : '—')}</div>
                    {attendee.check_in_at && <div className="text-[11px] text-slate-400">{formatDateTime(attendee.check_in_at)}</div>}
                    {attendee.signed_in_note && <div className="text-[11px] text-slate-400">{attendee.signed_in_note}</div>}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {attendee.user_id === user?.id && <>
                        <Button size="sm" variant="outline" disabled={saving === `attendance-${attendee.user_id}`} onClick={() => void updateAttendance(attendee.user_id, 'confirmed')}>Confirm</Button>
                        <Button size="sm" variant="ghost" disabled={saving === `attendance-${attendee.user_id}`} onClick={() => void updateAttendance(attendee.user_id, 'declined')}>Decline</Button>
                      </>}
                      {canManage && <Select className="h-8 w-32 py-0 text-xs" value={attendee.attendance} onChange={(event) => void updateAttendance(attendee.user_id, undefined, event.target.value)}>
                        {['unknown', 'present', 'absent', 'apology'].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
                      </Select>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </Card>
      )}

      {tab === 'tasks' && (
        <Card className="p-5">
          <SectionHeader title="Action items" description="Tasks assigned from this meeting and its resolutions." action={<LinkButton href="/workspace/tasks?create=1" variant="outline" size="sm">Open task register</LinkButton>} />
          <div className="mt-4 space-y-3">
            {(meeting.tasks || []).length === 0 && <div className="text-sm text-slate-400">No action items are linked to this meeting.</div>}
            {(meeting.tasks || []).map((task) => (
              <div key={task.id} className="record-row"><ClipboardCheck className="h-4 w-4 text-navy-600" /><div className="min-w-0 flex-1"><div className="font-semibold text-slate-800">{task.title}</div><div className="text-xs text-slate-400">{task.assignee_name} • due {formatDate(task.due_date)}</div></div><StatusBadge status={task.status} /></div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={resolutionOpen} onClose={() => setResolutionOpen(false)} title="Record meeting resolution" description="Use this standard form to capture decisions, responsible persons and deadlines." size="lg"
        footer={<><Button variant="outline" onClick={() => setResolutionOpen(false)}>Cancel</Button><Button type="submit" form="resolution-form" loading={saving === 'resolution'} icon={<Check className="h-4 w-4" />}>Save resolution</Button></>}>
        <form id="resolution-form" onSubmit={createResolution} className="space-y-4">
          <div className="form-grid">
            <Field label="Resolution title" required><Input value={resolution.title} onChange={(event) => setResolution({ ...resolution, title: event.target.value })} required /></Field>
            <Field label="Due date"><Input type="date" value={resolution.dueDate} onChange={(event) => setResolution({ ...resolution, dueDate: event.target.value })} /></Field>
            <Field label="Moved by"><Input value={resolution.movedBy} onChange={(event) => setResolution({ ...resolution, movedBy: event.target.value })} /></Field>
            <Field label="Seconded by"><Input value={resolution.secondedBy} onChange={(event) => setResolution({ ...resolution, secondedBy: event.target.value })} /></Field>
          </div>
          <Field label="Description"><Textarea rows={4} value={resolution.description} onChange={(event) => setResolution({ ...resolution, description: event.target.value })} /></Field>
          <label className="toggle-row"><span><span className="block text-sm font-medium text-slate-800">Create assigned task</span><span className="mt-0.5 block text-xs text-slate-500">Adds a conventional task with a responsible person and deadline.</span></span><input type="checkbox" className="toggle" checked={resolution.createTask} onChange={(event) => setResolution({ ...resolution, createTask: event.target.checked })} /></label>
          {resolution.createTask && <div className="form-grid">
            <Field label="Assigned person" required><Select value={resolution.taskAssigneeId} onChange={(event) => setResolution({ ...resolution, taskAssigneeId: event.target.value })} required><option value="">Select person</option>{(directory?.people || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></Field>
            <Field label="Task deadline" required><Input type="datetime-local" value={resolution.taskDueDate} onChange={(event) => setResolution({ ...resolution, taskDueDate: event.target.value })} required /></Field>
          </div>}
        </form>
      </Modal>

      <Modal open={attendeeOpen} onClose={() => setAttendeeOpen(false)} title="Add meeting attendees" description="Selected members receive a real in-app invitation." footer={<><Button variant="outline" onClick={() => setAttendeeOpen(false)}>Cancel</Button><Button loading={saving === 'attendees'} disabled={!selectedAttendees.length} onClick={() => void addAttendees()}>Add attendees</Button></>}>
        <div className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
          {(directory?.people || []).filter((person) => !(meeting.attendees || []).some((item) => item.user_id === person.id)).map((person) => (
            <label key={person.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={selectedAttendees.includes(person.id)} onChange={(event) => setSelectedAttendees((current) => event.target.checked ? [...current, person.id] : current.filter((value) => value !== person.id))} />
              <span className="truncate">{person.name}<span className="block text-xs text-slate-400">{person.position}</span></span>
            </label>
          ))}
          {(directory?.people || []).filter((person) => !(meeting.attendees || []).some((item) => item.user_id === person.id)).length === 0 && <div className="text-sm text-slate-400">All workspace members are already attendees.</div>}
        </div>
      </Modal>
    </div>
  );
}
