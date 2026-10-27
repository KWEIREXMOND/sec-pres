'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  MapPin,
  MessageSquarePlus,
  Paperclip,
  Phone,
  RefreshCcw,
  Search,
  Siren,
  UserRound,
} from 'lucide-react';
import type { HelpRequest } from '@/lib/shared-types';
import { apiPatch, apiPost, apiUpload, downloadApiFile } from '@/lib/api';
import { useApiData, useDebouncedValue } from '@/lib/hooks';
import { useAuth, useRealtime, useToast, useWorkspace } from '@/components/providers';
import { openHelpModal } from '@/lib/events';
import { formatDateTime, relativeTime, titleCase, truncate } from '@/lib/format';
import { ContactActions } from '@/components/ContactActions';
import { Alert, Badge, Button, Card, EmptyState, Field, KeyValue, LinkButton, Modal, PageHeader, PriorityBadge, SearchInput, SectionHeader, Select, Spinner, StatusBadge, Textarea, Timeline } from '@/components/ui';

function statusActions(current: string): Array<{ status: string; label: string; variant: 'primary' | 'success' | 'outline' | 'gold' }> {
  if (current === 'new') return [
    { status: 'acknowledged', label: 'Acknowledge', variant: 'gold' },
    { status: 'in_progress', label: 'Mark In Progress', variant: 'primary' },
    { status: 'resolved', label: 'Resolve', variant: 'success' },
  ];
  if (current === 'acknowledged') return [
    { status: 'in_progress', label: 'Mark In Progress', variant: 'primary' },
    { status: 'resolved', label: 'Resolve', variant: 'success' },
    { status: 'closed', label: 'Close', variant: 'outline' },
  ];
  if (current === 'in_progress') return [
    { status: 'resolved', label: 'Resolve', variant: 'success' },
    { status: 'closed', label: 'Close', variant: 'outline' },
  ];
  if (current === 'resolved') return [{ status: 'closed', label: 'Close Request', variant: 'outline' }];
  return [];
}

function HelpDetail({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { refresh } = useRealtime();
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useApiData<{ request: HelpRequest }>(`/help-requests/${id}`);
  const [statusModal, setStatusModal] = useState<{ status: string; label: string } | null>(null);
  const [statusComment, setStatusComment] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const request = data?.request;
  const canManage = Boolean(user?.permissions.includes('manage_help') || user?.role === 'system_admin');
  const isRequester = request?.requester_id === user?.id;

  useEffect(() => {
    if (!statusModal) return;
    setStatusComment('');
    setResolutionNote('');
  }, [statusModal]);

  if (loading) return <Spinner label="Loading HELP request" />;
  if (error) return <Alert tone="error" action={<Button size="sm" variant="outline" onClick={refetch}>Retry</Button>}>{error}</Alert>;
  if (!request) return <EmptyState title="Request not found" description="It may belong to another workspace." action={<LinkButton href="/workspace/help" variant="outline">Back to inbox</LinkButton>} />;

  const contactUserId = isRequester ? request.assigned_to : request.requester_id;
  const contactName = isRequester ? request.assignee_name : request.requester_name;

  const changeStatus = async () => {
    if (!statusModal) return;
    setActionLoading('status');
    try {
      const result = await apiPatch<{ message: string }>(`/help-requests/${id}/status`, {
        status: statusModal.status,
        comment: statusComment,
        resolutionNote: statusModal.status === 'resolved' || statusModal.status === 'closed' ? resolutionNote : '',
      });
      showToast({ title: 'Status updated', description: result.message, tone: 'success' });
      setStatusModal(null);
      await refetch();
      await refresh();
    } catch (err) {
      showToast({ title: 'Status update failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const acknowledge = async () => {
    setActionLoading('acknowledge');
    try {
      const result = await apiPost<{ message: string }>(`/help-requests/${id}/acknowledge`);
      showToast({ title: 'Request acknowledged', description: result.message, tone: 'success' });
      await refetch();
      await refresh();
    } catch (err) {
      showToast({ title: 'Acknowledgement failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const reopen = async () => {
    setActionLoading('reopen');
    try {
      const result = await apiPost<{ message: string }>(`/help-requests/${id}/reopen`);
      showToast({ title: 'Request reopened', description: result.message, tone: 'success' });
      await refetch();
      await refresh();
    } catch (err) {
      showToast({ title: 'Reopen failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const addUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!updateMessage.trim()) return;
    setActionLoading('update');
    try {
      await apiPost(`/help-requests/${id}/updates`, { kind: isRequester ? 'follow_up' : 'progress', message: updateMessage });
      setUpdateMessage('');
      showToast({ title: isRequester ? 'Follow-up sent' : 'Progress update saved', tone: 'success' });
      await refetch();
      await refresh();
    } catch (err) {
      showToast({ title: 'Update failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const upload = async () => {
    if (!attachment || !activeWorkspace) return;
    setActionLoading('upload');
    const form = new FormData();
    form.set('organizationId', activeWorkspace.id);
    form.set('entityType', 'help_request');
    form.set('entityId', id);
    form.set('file', attachment);
    try {
      await apiUpload('/attachments', form);
      setAttachment(null);
      if (fileRef.current) fileRef.current.value = '';
      showToast({ title: 'Attachment saved', description: 'The file is stored privately against this request.', tone: 'success' });
      await refetch();
    } catch (err) {
      showToast({ title: 'Upload failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="stack">
      <PageHeader
        eyebrow={`HELP request • ${request.reference}`}
        title={request.subject}
        description={`Submitted ${formatDateTime(request.submitted_at)} by ${request.requester_name || 'President'}`}
        actions={<LinkButton href="/workspace/help" variant="outline" icon={<ArrowLeft className="h-4 w-4" />}>Back to inbox</LinkButton>}
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={request.status} />
              <PriorityBadge priority={request.priority} />
              <Badge tone={request.escalation_level > 0 ? 'red' : 'muted'}>{request.escalation_level > 0 ? `Escalation level ${request.escalation_level}` : 'No escalation'}</Badge>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.description}</p>
            <div className="mt-5">
              <KeyValue items={[
                { label: 'Request type', value: request.request_type },
                { label: 'Manual location', value: <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{request.location}</span> },
                { label: 'Assigned Secretary', value: request.assignee_name || 'Awaiting routing' },
                { label: 'Submission channel', value: titleCase(request.channel) },
                { label: 'Acknowledged', value: request.acknowledged_at ? formatDateTime(request.acknowledged_at) : 'Awaiting acknowledgement' },
                { label: 'Resolved / closed', value: request.resolved_at ? formatDateTime(request.resolved_at) : request.closed_at ? formatDateTime(request.closed_at) : 'Not resolved' },
              ]} />
            </div>
            {request.resolution_note && <div className="mt-4"><Alert tone="success" title="Resolution note">{request.resolution_note}</Alert></div>}
          </Card>

          <Card className="p-5">
            <SectionHeader title="Contact the registered person" description={`${contactName || 'Contact'} • contact actions are logged with the request.`} />
            <div className="mt-4"><ContactActions helpRequestId={id} contactUserId={contactUserId} helpReference={request.reference} subject={request.subject} /></div>
            <p className="mt-3 text-xs text-slate-400">Opening a dialler or message composer does not place a call or confirm external delivery.</p>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Progress updates & follow-ups" description="In-app messages and updates are saved with timestamps." />
            <div className="mt-4 space-y-3">
              {(request.updates || []).length === 0 && <div className="text-sm text-slate-400">No updates have been recorded.</div>}
              {(request.updates || []).map((update) => (
                <div key={update.id} className="record-row">
                  <div>
                    <div className="text-xs font-semibold text-slate-700">{update.user_name} • {titleCase(update.kind)}</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{update.message}</p>
                  </div>
                  <div className="whitespace-nowrap text-[11px] text-slate-400">{relativeTime(update.created_at)}</div>
                </div>
              ))}
            </div>
            <form onSubmit={addUpdate} className="mt-4 space-y-3">
              <Field label={isRequester ? 'Send a follow-up message' : 'Add a progress update'} htmlFor="help-update" required>
                <Textarea id="help-update" rows={3} value={updateMessage} onChange={(event) => setUpdateMessage(event.target.value)} placeholder="Write a conventional update..." maxLength={1000} required />
              </Field>
              <Button type="submit" loading={actionLoading === 'update'} icon={<MessageSquarePlus className="h-4 w-4" />}>{isRequester ? 'Send follow-up' : 'Save progress update'}</Button>
            </form>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Complete status history" description="Every status change, escalation and reopening is preserved." />
            <div className="mt-5">
              <Timeline items={(request.history || []).map((event) => ({
                title: event.event_type === 'created' ? 'Request submitted' : event.event_type === 'escalation' ? 'Request escalated' : event.event_type === 'reopened' ? 'Request reopened' : `Status changed to ${titleCase(event.new_status || '')}`,
                description: [event.previous_status ? `From ${titleCase(event.previous_status)}` : '', event.comment || '', event.actor_name || ''].filter(Boolean).join(' • '),
                date: formatDateTime(event.created_at),
              }))} />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionHeader title="Status actions" description={canManage ? 'Secretariat workflow controls.' : 'Only the Secretariat can change status.'} />
            <div className="mt-4 space-y-2">
              {canManage && request.status === 'new' && <Button fullWidth variant="gold" loading={actionLoading === 'acknowledge'} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void acknowledge()}>Acknowledge request</Button>}
              {canManage && statusActions(request.status).filter((action) => action.status !== 'acknowledged').map((action) => (
                <Button key={action.status} fullWidth variant={action.variant} icon={<RefreshCcw className="h-4 w-4" />} onClick={() => setStatusModal(action)}>{action.label}</Button>
              ))}
              {isRequester && ['resolved', 'closed'].includes(request.status) && <Button fullWidth variant="outline" loading={actionLoading === 'reopen'} icon={<RefreshCcw className="h-4 w-4" />} onClick={() => void reopen()}>Reopen request</Button>}
              {!canManage && !['resolved', 'closed'].includes(request.status) && <div className="text-sm text-slate-500">The Secretary will acknowledge and update this request.</div>}
              {request.status === 'closed' && !isRequester && <div className="text-sm text-slate-500">This request is closed. History remains available.</div>}
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Supporting attachments" description="Private files linked to this request." />
            <div className="mt-4 space-y-2">
              {(request.attachments || []).length === 0 && <div className="text-sm text-slate-400">No attachments have been added.</div>}
              {(request.attachments || []).map((file) => (
                <button key={file.id} className="record-row w-full text-left" onClick={() => void downloadApiFile(`/attachments/${file.id}`, file.file_name)}>
                  <FileText className="h-4 w-4 text-navy-600" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-700">{file.file_name}</div>
                    <div className="text-[11px] text-slate-400">{truncate(file.mime_type, 40)}</div>
                  </div>
                  <Download className="h-4 w-4 text-slate-400" />
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <input ref={fileRef} type="file" className="w-full text-xs text-slate-600" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx" onChange={(event) => setAttachment(event.target.files?.[0] || null)} aria-label="Choose attachment" />
              <Button fullWidth variant="outline" size="sm" disabled={!attachment} loading={actionLoading === 'upload'} icon={<Paperclip className="h-4 w-4" />} onClick={() => void upload()}>Upload attachment</Button>
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Request people" description="Organization-scoped contact information." />
            <div className="mt-4 space-y-3">
              <div className="record-row"><UserRound className="h-4 w-4 text-navy-600" /><div><div className="text-xs text-slate-400">Requester</div><div className="text-sm font-medium text-slate-700">{request.requester_name}</div></div></div>
              <div className="record-row"><Phone className="h-4 w-4 text-navy-600" /><div><div className="text-xs text-slate-400">Registered number</div><div className="text-sm font-medium text-slate-700">{request.requester_phone || 'Restricted'}</div></div></div>
              <div className="record-row"><UserRound className="h-4 w-4 text-navy-600" /><div><div className="text-xs text-slate-400">Assigned Secretary</div><div className="text-sm font-medium text-slate-700">{request.assignee_name || 'Not assigned'}</div></div></div>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(statusModal)}
        onClose={() => setStatusModal(null)}
        title={`${statusModal?.label || 'Update request'}`}
        description="The change is saved with your account, timestamp and optional comment."
        footer={<><Button variant="outline" onClick={() => setStatusModal(null)}>Cancel</Button><Button loading={actionLoading === 'status'} onClick={() => void changeStatus()}>Save status</Button></>}
      >
        <div className="space-y-4">
          {statusModal && <Alert tone="info">Changing status to <strong>{titleCase(statusModal.status)}</strong>. The President receives an in-app notification.</Alert>}
          <Field label="Comment" htmlFor="status-comment">
            <Textarea id="status-comment" rows={3} value={statusComment} onChange={(event) => setStatusComment(event.target.value)} placeholder="Optional status note" />
          </Field>
          {statusModal && ['resolved', 'closed'].includes(statusModal.status) && (
            <Field label="Resolution note" htmlFor="resolution-note" required>
              <Textarea id="resolution-note" rows={3} value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Describe the assistance provided" required />
            </Field>
          )}
        </div>
      </Modal>
    </div>
  );
}

export function HelpPage({ id }: { id?: string }) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    return params.toString();
  }, [debouncedSearch, status, priority]);
  const path = id ? null : `/help-requests${query ? `?${query}` : ''}`;
  const { data, loading, error, refetch } = useApiData<{ requests: HelpRequest[] }>(path);
  const canCreate = Boolean(user?.permissions.includes('create_help') || user?.role === 'system_admin');
  const isSecretary = Boolean(user?.permissions.includes('manage_help') || user?.role === 'system_admin');

  if (id) return <HelpDetail id={id} />;

  const requests = data?.requests || [];

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Presidential assistance"
        title={isSecretary ? 'Urgent HELP Request Inbox' : 'My HELP Requests'}
        description={isSecretary ? 'New and unacknowledged requests are prioritized automatically.' : 'Track submission, acknowledgement, progress and resolution history.'}
        actions={canCreate ? <Button variant="danger" icon={<Siren className="h-4 w-4" />} onClick={openHelpModal}>New HELP request</Button> : undefined}
      />
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search reference, subject, description or location" />
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {['new', 'acknowledged', 'in_progress', 'resolved', 'closed'].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
          </Select>
          <Select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filter by priority">
            <option value="">All priorities</option>
            {['critical', 'urgent', 'high', 'normal', 'low'].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
          </Select>
          <Button variant="outline" icon={<Search className="h-4 w-4" />} onClick={refetch}>Apply</Button>
        </div>
      </Card>
      {error && <Alert tone="error" action={<Button size="sm" variant="outline" onClick={refetch}>Retry</Button>}>{error}</Alert>}
      {loading ? <Spinner label="Loading HELP requests" /> : (
        <Card className="overflow-hidden">
          {requests.length === 0 ? (
            <EmptyState title="No HELP requests found" description="Adjust the filters or submit a new presidential assistance request." icon={<Siren className="h-6 w-6" />} action={canCreate ? <Button variant="danger" onClick={openHelpModal}>Create HELP request</Button> : undefined} />
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.map((request) => (
                <Link key={request.id} href={`/workspace/help/${request.id}`} className="block px-5 py-4 transition hover:bg-slate-50">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className={`hidden h-11 w-1.5 rounded-full sm:block ${request.status === 'new' ? 'bg-red-500' : request.status === 'resolved' || request.status === 'closed' ? 'bg-emerald-500' : 'bg-gold-400'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-slate-800">{request.subject}</div>
                        <PriorityBadge priority={request.priority} />
                        <StatusBadge status={request.status} />
                        {request.escalation_level > 0 && <Badge tone="red">Escalated L{request.escalation_level}</Badge>}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {request.reference} • {request.requester_name} • {request.location} • {relativeTime(request.submitted_at)}
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500">{truncate(request.description, 160)}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <div className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatDateTime(request.submitted_at)}</div>
                      <div className="hidden sm:block">{request.assignee_name || 'Unassigned'}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
