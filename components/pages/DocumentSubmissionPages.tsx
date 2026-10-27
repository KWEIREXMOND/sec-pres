'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CheckCheck,
  Download,
  FileText,
  FileUp,
  Inbox,
  LockKeyhole,
  Paperclip,
  RotateCcw,
  Send,
  Users,
} from 'lucide-react';
import type { DocumentSubmission, DocumentSubmissionPerson, DocumentSubmissionStatus } from '@/lib/shared-types';
import { apiPatch, apiPost, apiUpload, downloadApiFile } from '@/lib/api';
import { useApiData } from '@/lib/hooks';
import { useAuth, useRealtime, useToast, useWorkspace } from '@/components/providers';
import { formatDateTime, titleCase, truncate } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LinkButton,
  Modal,
  PageHeader,
  SectionHeader,
  Select,
  Spinner,
  StatusBadge,
  Tabs,
  Textarea,
} from '@/components/ui';

type DeliveryMode = 'kept' | 'submitted';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentSubmissionsPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const { refresh } = useRealtime();
  const { data, loading, error, refetch } = useApiData<{ submissions: DocumentSubmission[]; people: DocumentSubmissionPerson[] }>('/document-submissions');
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('kept');
  const [recipientId, setRecipientId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState('all');
  const [actionId, setActionId] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<DocumentSubmission | null>(null);
  const [submitRecipient, setSubmitRecipient] = useState('');

  const people = data?.people || [];
  const submissions = data?.submissions || [];

  useEffect(() => {
    if (!recipientId && people.length) setRecipientId(people[0].id);
  }, [people, recipientId]);

  const counts = useMemo(() => ({
    all: submissions.length,
    inbox: submissions.filter((item) => item.delivery_mode === 'submitted' && item.recipient_id === user?.id).length,
    sent: submissions.filter((item) => item.delivery_mode === 'submitted' && item.sender_id === user?.id).length,
    kept: submissions.filter((item) => item.delivery_mode === 'kept' && item.sender_id === user?.id).length,
    archived: submissions.filter((item) => item.status === 'archived').length,
  }), [submissions, user?.id]);

  const visible = useMemo(() => {
    if (tab === 'inbox') return submissions.filter((item) => item.delivery_mode === 'submitted' && item.recipient_id === user?.id);
    if (tab === 'sent') return submissions.filter((item) => item.delivery_mode === 'submitted' && item.sender_id === user?.id);
    if (tab === 'kept') return submissions.filter((item) => item.delivery_mode === 'kept' && item.sender_id === user?.id);
    if (tab === 'archived') return submissions.filter((item) => item.status === 'archived');
    return submissions.filter((item) => item.status !== 'archived');
  }, [submissions, tab, user?.id]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDeliveryMode('kept');
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeWorkspace || !file) return;
    if (deliveryMode === 'submitted' && !recipientId) {
      showToast({ title: 'Choose a recipient', tone: 'warning' });
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.set('organizationId', activeWorkspace.id);
    form.set('title', title.trim());
    form.set('description', description.trim());
    form.set('deliveryMode', deliveryMode);
    if (deliveryMode === 'submitted') form.set('recipientId', recipientId);
    form.set('file', file);
    try {
      const result = await apiUpload<{ message: string }>('/document-submissions', form);
      showToast({ title: deliveryMode === 'submitted' ? 'Document submitted' : 'Document kept privately', description: result.message, tone: 'success' });
      resetForm();
      await refetch();
      await refresh();
    } catch (err) {
      showToast({ title: 'Upload failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const openSubmit = (submission: DocumentSubmission) => {
    setSubmitTarget(submission);
    setSubmitRecipient(people[0]?.id || '');
    setSubmitOpen(true);
  };

  const submitKept = async () => {
    if (!submitTarget || !submitRecipient) return;
    setActionId(submitTarget.id);
    try {
      const result = await apiPost<{ message: string }>(`/document-submissions/${submitTarget.id}/submit`, { recipientId: submitRecipient });
      showToast({ title: 'Document submitted', description: result.message, tone: 'success' });
      setSubmitOpen(false);
      setSubmitTarget(null);
      await refetch();
      await refresh();
    } catch (err) {
      showToast({ title: 'Submission failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setActionId(null);
    }
  };

  const updateStatus = async (submission: DocumentSubmission, status: DocumentSubmissionStatus) => {
    setActionId(submission.id);
    try {
      const result = await apiPatch<{ message: string }>(`/document-submissions/${submission.id}`, { status });
      showToast({ title: 'Submission updated', description: result.message, tone: 'success' });
      await refetch();
      await refresh();
    } catch (err) {
      showToast({ title: 'Update failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setActionId(null);
    }
  };

  const download = async (submission: DocumentSubmission) => {
    setActionId(submission.id);
    try {
      await downloadApiFile(`/document-submissions/${submission.id}/file`, submission.file_name);
      await refetch();
    } catch (err) {
      showToast({ title: 'Download failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Document exchange"
        title="Upload, keep and submit documents"
        description="Upload a file, keep it in your private vault, or submit it directly to another SRC user. The President and administration can monitor attendance and approvals separately."
        actions={<LinkButton href="/workspace/documents" variant="outline" icon={<FileText className="h-4 w-4" />}>Official repository</LinkButton>}
      />

      <div className="grid gap-4 xl:grid-cols-[380px_1fr] xl:items-start">
        <Card className="p-5">
          <SectionHeader title="Upload a document" description="PDF, Word, text and image files are supported." />
          <form className="mt-4 space-y-4" onSubmit={(event) => void upload(event)}>
            <Field label="Document title" htmlFor="submission-title" required>
              <Input id="submission-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Welfare committee report" required maxLength={200} />
            </Field>
            <Field label="Note" htmlFor="submission-note" hint="Optional">
              <Textarea id="submission-note" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should the recipient know about this file?" maxLength={1000} />
            </Field>
            <Field label="File" htmlFor="submission-file" required>
              <input
                ref={fileRef}
                id="submission-file"
                type="file"
                required
                accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp"
                className="w-full text-xs"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
            </Field>
            <Field label="What should happen?" htmlFor="submission-mode">
              <Select id="submission-mode" value={deliveryMode} onChange={(event) => setDeliveryMode(event.target.value as DeliveryMode)}>
                <option value="kept">Keep privately in my vault</option>
                <option value="submitted">Submit to another user now</option>
              </Select>
            </Field>
            {deliveryMode === 'submitted' && (
              <Field label="Recipient" htmlFor="submission-recipient" required>
                <Select id="submission-recipient" value={recipientId} onChange={(event) => setRecipientId(event.target.value)} required>
                  {people.length === 0 && <option value="">No recipients available</option>}
                  {people.map((person) => <option key={person.id} value={person.id}>{person.name} • {person.position || titleCase(person.role)}</option>)}
                </Select>
              </Field>
            )}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              {deliveryMode === 'kept'
                ? <><LockKeyhole className="mr-1 inline h-3.5 w-3.5" />The file stays private to you until you submit it to someone.</>
                : <><Users className="mr-1 inline h-3.5 w-3.5" />The recipient receives an in-app notification and can download the file.</>}
            </div>
            <Button type="submit" fullWidth loading={uploading} disabled={!file || (deliveryMode === 'submitted' && !recipientId)} icon={deliveryMode === 'submitted' ? <Send className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}>
              {deliveryMode === 'submitted' ? 'Upload & submit' : 'Upload & keep'}
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          {error && <Alert tone="error" action={<Button size="sm" variant="outline" onClick={refetch}>Retry</Button>}>{error}</Alert>}
          <Tabs
            tabs={[
              { id: 'all', label: 'Active', count: counts.all - counts.archived },
              { id: 'inbox', label: 'Received', count: counts.inbox },
              { id: 'sent', label: 'Submitted', count: counts.sent },
              { id: 'kept', label: 'My vault', count: counts.kept },
              { id: 'archived', label: 'Archived', count: counts.archived },
            ]}
            active={tab}
            onChange={setTab}
          />
          {loading && !data ? <Spinner label="Loading document submissions" /> : (
            <Card className="overflow-hidden">
              {visible.length === 0 ? (
                <EmptyState
                  title="No documents here"
                  description={tab === 'kept' ? 'Upload a document and choose “Keep privately” to store it here.' : 'Documents will appear here after they are uploaded or submitted.'}
                  icon={tab === 'inbox' ? <Inbox className="h-6 w-6" /> : <Paperclip className="h-6 w-6" />}
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {visible.map((submission) => {
                    const isSender = submission.sender_id === user?.id;
                    const isRecipient = submission.recipient_id === user?.id;
                    const canReview = isRecipient && submission.status !== 'reviewed' && submission.status !== 'archived';
                    return (
                      <div key={submission.id} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-sm font-semibold text-slate-800">{submission.title}</div>
                              <Badge tone={submission.delivery_mode === 'kept' ? 'muted' : 'navy'}>{submission.delivery_mode === 'kept' ? 'Private vault' : 'Submitted'}</Badge>
                              <StatusBadge status={submission.status} />
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {submission.reference} • {submission.file_name} • {formatSize(submission.size_bytes)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              From {submission.sender_name}
                              {submission.recipient_name ? ` to ${submission.recipient_name}` : ''} • {formatDateTime(submission.submitted_at || submission.created_at)}
                            </div>
                            {submission.description && <p className="mt-2 text-xs text-slate-600">{truncate(submission.description, 180)}</p>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Button size="sm" variant="outline" icon={<Download className="h-4 w-4" />} loading={actionId === submission.id} onClick={() => void download(submission)}>Download</Button>
                            {isSender && submission.delivery_mode === 'kept' && submission.status !== 'archived' && (
                              <Button size="sm" variant="gold" icon={<Send className="h-4 w-4" />} onClick={() => openSubmit(submission)}>Submit</Button>
                            )}
                            {canReview && (
                              <Button size="sm" variant="outline" icon={<CheckCheck className="h-4 w-4" />} onClick={() => void updateStatus(submission, 'reviewed')}>Mark reviewed</Button>
                            )}
                            {submission.status === 'archived' ? (
                              <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void updateStatus(submission, 'active')}>Restore</Button>
                            ) : (
                              <Button size="sm" variant="ghost" icon={<Archive className="h-4 w-4" />} onClick={() => void updateStatus(submission, 'archived')}>Archive</Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={submitOpen}
        onClose={() => { setSubmitOpen(false); setSubmitTarget(null); }}
        title="Submit kept document"
        description={submitTarget ? `Send “${submitTarget.title}” to another workspace user.` : undefined}
        footer={<><Button variant="outline" onClick={() => { setSubmitOpen(false); setSubmitTarget(null); }}>Cancel</Button><Button loading={Boolean(actionId)} disabled={!submitRecipient} icon={<Send className="h-4 w-4" />} onClick={() => void submitKept()}>Submit document</Button></>}
      >
        <div className="space-y-4">
          <Field label="Recipient" htmlFor="kept-recipient" required>
            <Select id="kept-recipient" value={submitRecipient} onChange={(event) => setSubmitRecipient(event.target.value)}>
              {people.length === 0 && <option value="">No recipients available</option>}
              {people.map((person) => <option key={person.id} value={person.id}>{person.name} • {person.position || titleCase(person.role)}</option>)}
            </Select>
          </Field>
          <Alert tone="info">The recipient will receive a notification and the file will remain private to you, them and administrators.</Alert>
        </div>
      </Modal>
    </div>
  );
}
