'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Mail,
  MessageSquarePlus,
  Paperclip,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import type { CalendarEvent, Correspondence, DirectoryEntry, DocumentRecord, Task } from '@/lib/shared-types';
import { apiDelete, apiPatch, apiPost, apiUpload, downloadApiFile } from '@/lib/api';
import { useApiData } from '@/lib/hooks';
import { useAuth, useRealtime, useToast, useWorkspace } from '@/components/providers';
import { dateTimeLocalValue, formatDate, formatDateTime, isOverdue, titleCase, truncate } from '@/lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, LinkButton, Modal, PageHeader, PriorityBadge, SearchInput, SectionHeader, Select, Spinner, StatusBadge, TableWrap, Textarea, Timeline } from '@/components/ui';

const taskStatuses = ['pending', 'in_progress', 'awaiting_review', 'completed', 'overdue'];
const priorities = ['low', 'normal', 'high', 'urgent', 'critical'];

function TaskModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const { data: directory } = useApiData<{ people: DirectoryEntry[] }>('/directory', { enabled: open });
  const { data: meetings } = useApiData<{ meetings: Array<{ id: string; title: string }> }>('/meetings', { enabled: open });
  const [form, setForm] = useState({ title: '', description: '', assignedTo: '', priority: 'normal', dueDate: dateTimeLocalValue(new Date(Date.now() + 3 * 86400000)), meetingId: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ title: '', description: '', assignedTo: '', priority: 'normal', dueDate: dateTimeLocalValue(new Date(Date.now() + 3 * 86400000)), meetingId: '' });
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      await apiPost('/tasks', { organizationId: activeWorkspace.id, ...form, meetingId: form.meetingId || null, resolutionId: null });
      showToast({ title: 'Task saved', description: 'The assignee received an in-app notification.', tone: 'success' });
      onClose();
      onSaved();
    } catch (error) {
      showToast({ title: 'Task could not be saved', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add task or action item" description="Record responsibility, priority, deadline and an optional meeting link." size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="task-form" loading={loading}>Save task</Button></>}>
      <form id="task-form" onSubmit={submit} className="space-y-4">
        <div className="form-grid">
          <Field label="Task title" required><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></Field>
          <Field label="Assigned person" required><Select value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })} required><option value="">Select person</option>{(directory?.people || []).map((person) => <option key={person.id} value={person.id}>{person.name} • {person.position}</option>)}</Select></Field>
          <Field label="Priority"><Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{priorities.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select></Field>
          <Field label="Due date and time" required><Input type="datetime-local" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} required /></Field>
          <Field label="Related meeting"><Select value={form.meetingId} onChange={(event) => setForm({ ...form, meetingId: event.target.value })}><option value="">No meeting</option>{(meetings?.meetings || []).map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.title}</option>)}</Select></Field>
        </div>
        <Field label="Description"><Textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
      </form>
    </Modal>
  );
}

function TaskDetailModal({ taskId, onClose, onSaved }: { taskId: string | null; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const { data, loading, refetch } = useApiData<{ task: Task }>(taskId ? `/tasks/${taskId}` : null, { enabled: Boolean(taskId) });
  const [status, setStatus] = useState('pending');
  const [progress, setProgress] = useState(0);
  const [comment, setComment] = useState('');
  const [completionNote, setCompletionNote] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const task = data?.task;
  const canManage = Boolean(user?.permissions.includes('manage_tasks') || user?.role === 'system_admin');
  const canUpdate = canManage || task?.assigned_to === user?.id;

  useEffect(() => {
    if (!task) return;
    setStatus(task.status);
    setProgress(task.progress);
    setCompletionNote(task.completion_note || '');
  }, [task]);

  const save = async () => {
    if (!taskId) return;
    setSaving('save');
    try {
      const body: Record<string, unknown> = { status, progress, comment: comment || undefined };
      if (status === 'completed') body.completionNote = completionNote;
      if (!canManage) delete body.progress;
      await apiPatch(`/tasks/${taskId}`, body);
      setComment('');
      showToast({ title: 'Task updated', tone: 'success' });
      await refetch();
      onSaved();
    } catch (error) {
      showToast({ title: 'Update failed', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const upload = async () => {
    if (!taskId || !attachment || !activeWorkspace) return;
    setSaving('upload');
    const form = new FormData();
    form.set('organizationId', activeWorkspace.id);
    form.set('entityType', 'task');
    form.set('entityId', taskId);
    form.set('file', attachment);
    try {
      await apiUpload('/attachments', form);
      setAttachment(null);
      showToast({ title: 'Attachment saved', tone: 'success' });
      await refetch();
    } catch (error) {
      showToast({ title: 'Upload failed', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Modal open={Boolean(taskId)} onClose={onClose} title={task?.title || 'Task details'} description="Update progress, status, comments and completion notes." size="lg" footer={<><Button variant="outline" onClick={onClose}>Close</Button>{canUpdate && <Button loading={saving === 'save'} onClick={() => void save()}>Save changes</Button>}</>}>
      {loading || !task ? <Spinner label="Loading task" /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2"><StatusBadge status={task.status} /><PriorityBadge priority={task.priority} /><Badge tone={isOverdue(task.due_date, task.status) ? 'red' : 'muted'}>Due {formatDateTime(task.due_date)}</Badge></div>
          <p className="whitespace-pre-wrap text-sm text-slate-600">{task.description || 'No description provided.'}</p>
          <div className="form-grid">
            <Field label="Status"><Select value={status} onChange={(event) => setStatus(event.target.value)} disabled={!canUpdate}>{taskStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select></Field>
            <Field label={`Progress ${progress}%`}><input type="range" min={0} max={100} step={5} value={progress} onChange={(event) => setProgress(Number(event.target.value))} disabled={!canManage} className="mt-3 w-full accent-navy-700" /></Field>
          </div>
          {status === 'completed' && <Field label="Completion note"><Textarea rows={2} value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} /></Field>}
          <Card className="p-4"><SectionHeader title="Progress comments" description="Saved with author and timestamp." /><div className="mt-3 space-y-2">{(task.comments || []).length === 0 && <div className="text-sm text-slate-400">No comments yet.</div>}{(task.comments || []).map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-xs"><div className="font-semibold text-slate-700">{item.user_name} • {formatDateTime(item.created_at)}</div><div className="mt-1 text-slate-600">{item.comment}</div></div>)}</div>{canUpdate && <div className="mt-3 flex gap-2"><Input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a progress comment" /><Button size="sm" variant="outline" icon={<MessageSquarePlus className="h-4 w-4" />} onClick={() => void save()}>Add</Button></div>}</Card>
          <Card className="p-4"><SectionHeader title="Private attachments" description="Download is restricted to this workspace." /><div className="mt-3 space-y-2">{(task.attachments || []).length === 0 && <div className="text-sm text-slate-400">No attachments.</div>}{(task.attachments || []).map((file) => <button key={file.id} className="record-row w-full text-left" onClick={() => void downloadApiFile(`/attachments/${file.id}`, file.file_name)}><Paperclip className="h-4 w-4" /><div className="flex-1 truncate text-sm">{file.file_name}</div><Download className="h-4 w-4" /></button>)}</div><div className="mt-3 flex gap-2"><input type="file" className="w-full text-xs" onChange={(event) => setAttachment(event.target.files?.[0] || null)} /><Button size="sm" variant="outline" disabled={!attachment} loading={saving === 'upload'} onClick={() => void upload()}>Upload</Button></div></Card>
        </div>
      )}
    </Modal>
  );
}

export function TasksPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [due, setDue] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const { data: directory } = useApiData<{ people: DirectoryEntry[] }>('/directory');
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (priority) params.set('priority', priority);
  if (assignedTo) params.set('assignedTo', assignedTo);
  if (due) params.set('due', due);
  const { data, loading, error, refetch } = useApiData<{ tasks: Task[] }>(`/tasks${params.toString() ? `?${params}` : ''}`);
  const canCreate = Boolean(user?.permissions.includes('manage_tasks') || user?.role === 'system_admin');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('create') === '1') setCreateOpen(true);
  }, []);

  return (
    <div className="stack">
      <PageHeader eyebrow="Task & decision management" title="Tasks and executive decisions" description="Track presidential instructions, meeting action points, responsible persons, deadlines and progress." actions={canCreate ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Add task</Button> : undefined} />
      <Card className="p-4"><div className="grid gap-3 md:grid-cols-[1fr_150px_150px_180px_150px_auto]"><SearchInput value={search} onChange={setSearch} placeholder="Search tasks or assignees" /><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{taskStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select><Select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">All priorities</option>{priorities.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select><Select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}><option value="">All people</option>{(directory?.people || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</Select><Select value={due} onChange={(event) => setDue(event.target.value)}><option value="">Any deadline</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="week">Next 7 days</option></Select><Button variant="outline" onClick={refetch}>Refresh</Button></div></Card>
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <Spinner label="Loading tasks" /> : (data?.tasks || []).length === 0 ? <EmptyState title="No tasks found" description="Create a task or adjust your filters." icon={<CheckCircle2 className="h-6 w-6" />} /> : (
        <Card className="overflow-hidden"><TableWrap className="rounded-none border-0"><table className="data-table"><thead><tr><th>Task</th><th>Assigned to</th><th>Priority</th><th>Due</th><th>Status</th><th>Progress</th><th /></tr></thead><tbody>
          {(data?.tasks || []).map((task) => <tr key={task.id} className="clickable" onClick={() => setSelectedTask(task.id)}><td><div className="font-semibold text-slate-800">{task.title}</div><div className="text-xs text-slate-400">{truncate(task.description, 90)}</div></td><td>{task.assignee_name}</td><td><PriorityBadge priority={task.priority} /></td><td className={isOverdue(task.due_date, task.status) ? 'font-semibold text-red-600' : ''}>{formatDateTime(task.due_date)}</td><td><StatusBadge status={task.status} /></td><td><div className="h-2 w-24 rounded-full bg-slate-100"><div className="h-full rounded-full bg-navy-600" style={{ width: `${task.progress}%` }} /></div></td><td><Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setSelectedTask(task.id); }}>Open</Button></td></tr>)}
        </tbody></table></TableWrap></Card>
      )}
      <TaskModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={refetch} />
      <TaskDetailModal taskId={selectedTask} onClose={() => setSelectedTask(null)} onSaved={refetch} />
    </div>
  );
}

const correspondenceStatuses = ['draft', 'pending_approval', 'approved', 'sent', 'answered', 'archived'];

function CorrespondenceModal({ open, onClose, editing, onSaved }: { open: boolean; onClose: () => void; editing: Correspondence | null; onSaved: () => void }) {
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const { data: documents } = useApiData<{ documents: DocumentRecord[] }>('/documents', { enabled: open });
  const [form, setForm] = useState({ direction: 'outgoing', subject: '', sender: '', recipient: '', documentId: '', status: 'draft', receivedAt: dateTimeLocalValue(), responseDueAt: '', followUpAt: '', deliveryDetails: '', responseNotes: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) setForm({ direction: editing.direction, subject: editing.subject, sender: editing.sender, recipient: editing.recipient, documentId: editing.document_id || '', status: editing.status, receivedAt: dateTimeLocalValue(new Date(editing.received_at)), responseDueAt: editing.response_due_at ? dateTimeLocalValue(new Date(editing.response_due_at)) : '', followUpAt: editing.follow_up_at ? dateTimeLocalValue(new Date(editing.follow_up_at)) : '', deliveryDetails: editing.delivery_details, responseNotes: editing.response_notes });
    else setForm({ direction: 'outgoing', subject: '', sender: activeWorkspace?.name || '', recipient: '', documentId: '', status: 'draft', receivedAt: dateTimeLocalValue(), responseDueAt: '', followUpAt: '', deliveryDetails: '', responseNotes: '' });
  }, [open, editing, activeWorkspace]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      if (editing) await apiPatch(`/correspondence/${editing.id}`, form);
      else await apiPost('/correspondence', { ...form, organizationId: activeWorkspace?.id, documentId: form.documentId || null, responseDueAt: form.responseDueAt || null, followUpAt: form.followUpAt || null });
      showToast({ title: editing ? 'Correspondence updated' : 'Correspondence saved', tone: 'success' });
      onClose();
      onSaved();
    } catch (error) {
      showToast({ title: 'Save failed', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit correspondence entry' : 'Record official correspondence'} description="Incoming and outgoing communication with references, dates, delivery and follow-up details." size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="correspondence-form" loading={loading}>Save entry</Button></>}>
      <form id="correspondence-form" onSubmit={submit} className="space-y-4">
        <div className="form-grid-3"><Field label="Direction"><Select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value })}><option value="outgoing">Outgoing</option><option value="incoming">Incoming</option></Select></Field><Field label="Status"><Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{correspondenceStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select></Field><Field label="Linked document"><Select value={form.documentId} onChange={(event) => setForm({ ...form, documentId: event.target.value })}><option value="">None</option>{(documents?.documents || []).map((document) => <option key={document.id} value={document.id}>{document.reference} • {document.title}</option>)}</Select></Field></div>
        <div className="form-grid"><Field label="Subject" required><Input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required /></Field><Field label="Received / created date" required><Input type="datetime-local" value={form.receivedAt} onChange={(event) => setForm({ ...form, receivedAt: event.target.value })} required /></Field><Field label="Sender" required><Input value={form.sender} onChange={(event) => setForm({ ...form, sender: event.target.value })} required /></Field><Field label="Recipient" required><Input value={form.recipient} onChange={(event) => setForm({ ...form, recipient: event.target.value })} required /></Field><Field label="Response due"><Input type="datetime-local" value={form.responseDueAt} onChange={(event) => setForm({ ...form, responseDueAt: event.target.value })} /></Field><Field label="Follow-up date"><Input type="datetime-local" value={form.followUpAt} onChange={(event) => setForm({ ...form, followUpAt: event.target.value })} /></Field></div>
        <Field label="Delivery details"><Textarea rows={2} value={form.deliveryDetails} onChange={(event) => setForm({ ...form, deliveryDetails: event.target.value })} /></Field>
        <Field label="Response notes"><Textarea rows={2} value={form.responseNotes} onChange={(event) => setForm({ ...form, responseNotes: event.target.value })} /></Field>
      </form>
    </Modal>
  );
}

export function CorrespondencePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Correspondence | null>(null);
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (direction) params.set('direction', direction);
  const { data, loading, error, refetch } = useApiData<{ correspondence: Correspondence[] }>(`/correspondence${params.toString() ? `?${params}` : ''}`);
  const canManage = Boolean(user?.permissions.includes('manage_correspondence') || user?.role === 'system_admin');

  const quickStatus = async (item: Correspondence, nextStatus: string) => {
    try {
      await apiPatch(`/correspondence/${item.id}`, { status: nextStatus });
      showToast({ title: `Correspondence marked ${titleCase(nextStatus)}`, tone: 'success' });
      await refetch();
    } catch (err) {
      showToast({ title: 'Status update failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    }
  };

  return (
    <div className="stack">
      <PageHeader eyebrow="Official correspondence" title="Correspondence register" description="Incoming and outgoing letters, memoranda, invitations and circulars with dispatch and response tracking." actions={canManage ? <Button icon={<Mail className="h-4 w-4" />} onClick={() => { setEditing(null); setModalOpen(true); }}>Add correspondence</Button> : undefined} />
      <Card className="p-4"><div className="grid gap-3 md:grid-cols-[1fr_160px_160px_auto]"><SearchInput value={search} onChange={setSearch} placeholder="Search reference, subject, sender or recipient" /><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{correspondenceStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select><Select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="">All directions</option><option value="incoming">Incoming</option><option value="outgoing">Outgoing</option></Select><Button variant="outline" onClick={refetch}>Refresh</Button></div></Card>
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <Spinner label="Loading correspondence" /> : (data?.correspondence || []).length === 0 ? <EmptyState title="No correspondence found" description="Record an incoming or outgoing official communication." icon={<Mail className="h-6 w-6" />} /> : (
        <Card className="overflow-hidden"><TableWrap className="rounded-none border-0"><table className="data-table"><thead><tr><th>Reference</th><th>Subject</th><th>Direction</th><th>Parties</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {(data?.correspondence || []).map((item) => <tr key={item.id}><td>{item.reference}</td><td><div className="font-semibold text-slate-800">{item.subject}</div><div className="text-xs text-slate-400">{truncate(item.delivery_details, 70)}</div></td><td><Badge tone={item.direction === 'incoming' ? 'navy' : 'gold'}>{titleCase(item.direction)}</Badge></td><td>{item.sender} → {item.recipient}</td><td>{formatDateTime(item.received_at)}</td><td><StatusBadge status={item.status} /></td><td><div className="row-actions">{canManage && <Button size="sm" variant="outline" onClick={() => { setEditing(item); setModalOpen(true); }}>Edit</Button>}{item.status === 'draft' && canManage && <Button size="sm" variant="gold" icon={<Send className="h-3.5 w-3.5" />} onClick={() => void quickStatus(item, 'sent')}>Mark sent</Button>}{item.status === 'sent' && canManage && <Button size="sm" variant="outline" onClick={() => void quickStatus(item, 'answered')}>Mark answered</Button>}{item.document_id && <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => void downloadApiFile(`/documents/${item.document_id}/pdf`, `${item.reference}.pdf`)} aria-label="Download linked document" />}</div></td></tr>)}
        </tbody></table></TableWrap></Card>
      )}
      <CorrespondenceModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} onSaved={refetch} />
    </div>
  );
}

const calendarTypes = ['meeting', 'appointment', 'school_event', 'zonal_programme', 'deadline', 'activity'];

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function CalendarPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState({ title: '', type: 'activity', startsAt: dateTimeLocalValue(), endsAt: '', location: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));
  const { data, loading, error, refetch } = useApiData<{ events: CalendarEvent[] }>(`/calendar?from=${localDateKey(gridStart)}&to=${localDateKey(gridEnd)}`);
  const events = data?.events || [];
  const canEdit = Boolean(user?.permissions.includes('manage_meetings') || user?.permissions.includes('create_meeting_request') || user?.role === 'system_admin');

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [gridStart.getTime(), gridEnd.getTime()]);

  const eventsForDay = (date: Date) => events.filter((event) => localDateKey(new Date(event.starts_at)) === localDateKey(date));

  const openCreate = (date?: Date) => {
    setEditing(null);
    const start = date ? new Date(date) : new Date();
    start.setHours(9, 0, 0, 0);
    setForm({ title: '', type: 'activity', startsAt: dateTimeLocalValue(start), endsAt: '', location: '', notes: '' });
    setModalOpen(true);
  };

  const openEdit = (event: CalendarEvent) => {
    setEditing(event);
    setForm({ title: event.title, type: event.type, startsAt: dateTimeLocalValue(new Date(event.starts_at)), endsAt: event.ends_at ? dateTimeLocalValue(new Date(event.ends_at)) : '', location: event.location, notes: event.notes });
    setModalOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) await apiPatch(`/calendar/${editing.id}`, form);
      else await apiPost('/calendar', form);
      showToast({ title: editing ? 'Calendar entry updated' : 'Calendar entry saved', tone: 'success' });
      setModalOpen(false);
      await refetch();
    } catch (err) {
      showToast({ title: 'Calendar save failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await apiDelete(`/calendar/${editing.id}`);
      showToast({ title: 'Calendar entry deleted', tone: 'success' });
      setModalOpen(false);
      await refetch();
    } catch (err) {
      showToast({ title: 'Delete failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <PageHeader eyebrow="Presidential calendar" title="Calendar & appointments" description="Executive meetings, appointments, school events, zonal programmes, deadlines and activities." actions={canEdit ? <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => openCreate()}>Add calendar entry</Button> : undefined} />
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Button variant="outline" size="sm" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month" /><div className="min-w-44 text-center text-lg font-semibold text-navy-900">{new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(month)}</div><Button variant="outline" size="sm" icon={<ChevronRight className="h-4 w-4" />} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month" /></div>
          <div className="row-actions"><Button variant="outline" size="sm" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</Button><Button variant="outline" size="sm" onClick={refetch}>Refresh</Button></div>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {loading ? <Spinner label="Loading calendar" /> : (
          <>
            <div className="calendar-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="bg-slate-50 p-2 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">{day}</div>)}
              {calendarDays.map((date) => {
                const dayEvents = eventsForDay(date);
                const muted = date.getMonth() !== month.getMonth();
                return (
                  <div key={localDateKey(date)} className={`calendar-cell ${muted ? 'calendar-cell-muted' : ''}`}>
                    <div className="mb-1 flex items-center justify-between"><span className="font-semibold">{date.getDate()}</span>{canEdit && <button className="text-slate-400 hover:text-navy-700" onClick={() => openCreate(date)} aria-label={`Add event on ${localDateKey(date)}`}><Plus className="h-3 w-3" /></button>}</div>
                    {dayEvents.slice(0, 3).map((event) => <button key={event.id} className="calendar-event block w-full text-left" onClick={() => event.meeting_id ? window.location.href = `/workspace/meetings/${event.meeting_id}` : openEdit(event)}>{event.title}</button>)}
                    {dayEvents.length > 3 && <div className="text-[10px] text-slate-400">+{dayEvents.length - 3} more</div>}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {events.slice(0, 12).map((event) => <div key={event.id} className="record-row"><CalendarDays className="h-4 w-4 text-navy-600" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-800">{event.title}</div><div className="text-xs text-slate-400">{formatDateTime(event.starts_at)} • {event.location || titleCase(event.type)}</div></div>{event.meeting_id ? <Link href={`/workspace/meetings/${event.meeting_id}`} className="text-xs font-semibold text-navy-700">Meeting</Link> : canEdit && <Button size="sm" variant="ghost" onClick={() => openEdit(event)}>Edit</Button>}</div>)}
            </div>
          </>
        )}
      </Card>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit calendar entry' : 'Add calendar entry'} description="Saved entries appear in the workspace calendar and are eligible for reminders." footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>{editing && !editing.meeting_id && canEdit && <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()} loading={saving}>Delete</Button>}<Button type="submit" form="calendar-form" loading={saving}>Save entry</Button></>}>
        <form id="calendar-form" onSubmit={save} className="space-y-4">
          <div className="form-grid"><Field label="Title" required><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></Field><Field label="Type"><Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{calendarTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select></Field><Field label="Starts" required><Input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} required /></Field><Field label="Ends"><Input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></Field><Field label="Location"><Input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></Field></div>
          <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
        </form>
      </Modal>
    </div>
  );
}
