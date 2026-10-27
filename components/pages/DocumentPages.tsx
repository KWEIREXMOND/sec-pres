'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Download,
  FilePlus2,
  FileText,
  History,
  Paperclip,
  PenLine,
  Printer,
  Save,
  Send,
  Stamp,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { DocumentRecord, Template } from '@/lib/shared-types';
import { apiDelete, apiPatch, apiPost, apiUpload, downloadApiFile } from '@/lib/api';
import { useApiData } from '@/lib/hooks';
import { useAuth, useRealtime, useToast, useWorkspace } from '@/components/providers';
import { formatDateTime, titleCase, truncate } from '@/lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, LinkButton, Modal, PageHeader, PrintableDocument, SearchInput, SectionHeader, Select, Spinner, StatusBadge, TableWrap, Tabs, Textarea, Timeline } from '@/components/ui';

const documentKinds = ['letter', 'notice', 'circular', 'memo', 'minutes', 'report', 'proposal', 'event_plan', 'policy', 'constitution', 'handover', 'other'];
const documentStatuses = ['draft', 'pending_approval', 'approved', 'sent', 'answered', 'revisions_requested', 'rejected', 'archived'];

export function DocumentsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (kind) params.set('kind', kind);
  if (category) params.set('category', category);
  if (tag) params.set('tag', tag);
  const { data, loading, error, refetch } = useApiData<{ documents: DocumentRecord[]; categories: string[] }>(`/documents${params.toString() ? `?${params}` : ''}`);
  const canCreate = Boolean(user?.permissions.includes('manage_documents') || user?.role === 'system_admin');

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Document repository"
        title="Official documents"
        description="Manually authored letters, notices, minutes, policies, reports and handover records with version history."
        actions={<>{canCreate && <LinkButton href="/workspace/documents/new" icon={<FilePlus2 className="h-4 w-4" />}>New document</LinkButton>}<LinkButton href="/workspace/submissions" variant="outline" icon={<Send className="h-4 w-4" />}>Upload / submit file</LinkButton><LinkButton href="/workspace/templates" variant="outline" icon={<BookOpen className="h-4 w-4" />}>Templates</LinkButton></>}
      />
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_170px_170px_170px_170px_auto]">
          <SearchInput value={search} onChange={setSearch} placeholder="Search title, reference, content or tags" />
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{documentStatuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select>
          <Select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Filter by kind"><option value="">All types</option>{documentKinds.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select>
          <Select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category"><option value="">All categories</option>{(data?.categories || []).map((value) => <option key={value} value={value}>{value}</option>)}</Select>
          <Input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="Tag" aria-label="Filter by tag" />
          <Button variant="outline" onClick={refetch}>Refresh</Button>
        </div>
      </Card>
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <Spinner label="Loading document repository" /> : (
        <Card className="overflow-hidden">
          {(data?.documents || []).length === 0 ? <EmptyState title="No documents found" description="Create a manual document or adjust your filters." icon={<FileText className="h-6 w-6" />} action={canCreate ? <LinkButton href="/workspace/documents/new">Create document</LinkButton> : undefined} /> : (
            <TableWrap className="rounded-none border-0">
              <table className="data-table"><thead><tr><th>Document</th><th>Type</th><th>Reference</th><th>Category</th><th>Status</th><th>Version</th><th>Updated</th><th>Actions</th></tr></thead><tbody>
                {(data?.documents || []).map((document) => (
                  <tr key={document.id}>
                    <td><div className="font-semibold text-slate-800">{document.title}</div><div className="text-xs text-slate-400">{document.author_name} • {truncate(document.subject, 60)}</div></td>
                    <td>{titleCase(document.kind)}</td>
                    <td>{document.reference}</td>
                    <td>{document.category}</td>
                    <td><StatusBadge status={document.status} /></td>
                    <td>v{document.version}</td>
                    <td>{formatDateTime(document.updated_at)}</td>
                    <td><div className="row-actions"><LinkButton href={`/workspace/documents/${document.id}`} variant="outline" size="sm">Open</LinkButton><Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => void downloadApiFile(`/documents/${document.id}/pdf`, `${document.reference}.pdf`)} aria-label={`Download ${document.title}`}>PDF</Button></div></td>
                  </tr>
                ))}
              </tbody></table>
            </TableWrap>
          )}
        </Card>
      )}
    </div>
  );
}

interface DocumentFormState {
  title: string;
  kind: string;
  category: string;
  subject: string;
  recipient: string;
  content: string;
  tags: string;
  status: string;
}

const emptyForm: DocumentFormState = {
  title: '',
  kind: 'letter',
  category: 'General',
  subject: '',
  recipient: '',
  content: '',
  tags: '',
  status: 'draft',
};

function TemplateSelector({ form, onContent }: { form: DocumentFormState; onContent: (value: string) => void }) {
  const { data } = useApiData<{ templates: Template[] }>('/templates');
  const { showToast } = useToast();
  const [templateId, setTemplateId] = useState('');
  const [loading, setLoading] = useState(false);
  const templates = (data?.templates || []).filter((template) => ['letter', 'notice', 'memo', 'report'].includes(template.type));

  useEffect(() => {
    const selectFromQuery = (event: Event) => {
      const requested = (event as CustomEvent<string>).detail;
      if (requested && templates.some((template) => template.id === requested)) setTemplateId(requested);
    };
    window.addEventListener('srcpro:select-template', selectFromQuery);
    const query = new URLSearchParams(window.location.search).get('templateId');
    if (query && templates.some((template) => template.id === query)) setTemplateId(query);
    return () => window.removeEventListener('srcpro:select-template', selectFromQuery);
  }, [templates]);

  const insert = async () => {
    if (!templateId) return;
    setLoading(true);
    try {
      const result = await apiPost<{ content: string }>('/templates/render', {
        templateId,
        values: {
          subject: form.subject,
          recipient: form.recipient,
          title: form.title,
          audience: form.recipient || 'all members',
          main_business: form.subject,
          body: '',
          summary: '',
          period: new Date().toISOString().slice(0, 7),
        },
      });
      onContent(result.content);
      showToast({ title: 'Template inserted', description: 'The content is now fully under your control.', tone: 'success' });
    } catch (error) {
      showToast({ title: 'Template could not be inserted', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-end">
      <Field label="Reusable document template" className="flex-1">
        <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          <option value="">Choose a template</option>
          {templates.map((template) => <option key={template.id} value={template.id}>{template.name} • {titleCase(template.type)}</option>)}
        </Select>
      </Field>
      <Button variant="outline" loading={loading} disabled={!templateId} onClick={() => void insert()}>Insert template</Button>
    </div>
  );
}

export function DocumentEditorPage({ id }: { id?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const { refresh } = useRealtime();
  const isNew = !id;
  const { data, loading, error, refetch } = useApiData<{ document: DocumentRecord }>(id ? `/documents/${id}` : null);
  const [form, setForm] = useState<DocumentFormState>(emptyForm);
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState('approved');
  const [reviewComment, setReviewComment] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [versionPreview, setVersionPreview] = useState<any | null>(null);
  const document = data?.document;
  const canManage = Boolean(user?.permissions.includes('manage_documents') || user?.role === 'system_admin');
  const canReview = Boolean(user?.permissions.includes('review_documents') || user?.role === 'system_admin');
  const canEdit = isNew ? canManage : canManage || (document?.created_by === user?.id && ['draft', 'revisions_requested', 'rejected'].includes(document?.status || ''));

  useEffect(() => {
    if (document) {
      setForm({ title: document.title, kind: document.kind, category: document.category, subject: document.subject, recipient: document.recipient, content: document.content, tags: document.tags, status: document.status });
    }
  }, [document]);

  const saveDocument = async (submit = false) => {
    if (!activeWorkspace || !canEdit) return;
    setSaving(submit ? 'submit' : 'save');
    try {
      if (isNew) {
        const result = await apiPost<{ document: DocumentRecord; message: string }>('/documents', {
          organizationId: activeWorkspace.id,
          title: form.title,
          kind: form.kind,
          category: form.category,
          subject: form.subject,
          recipient: form.recipient,
          content: form.content,
          tags: form.tags,
          status: submit ? 'pending_approval' : 'draft',
        });
        showToast({ title: submit ? 'Document submitted' : 'Draft saved', description: result.message, tone: 'success' });
        router.replace(`/workspace/documents/${result.document.id}`);
      } else {
        await apiPatch(`/documents/${id}`, { ...form, status: submit ? 'pending_approval' : form.status, changeNote: changeNote || 'Manual edit.' });
        if (submit) await apiPost(`/documents/${id}/submit`);
        showToast({ title: submit ? 'Document submitted for approval' : 'Document saved', tone: 'success' });
        setChangeNote('');
        await refetch();
        await refresh();
      }
    } catch (err) {
      showToast({ title: 'Document could not be saved', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const submitReview = async () => {
    if (!id) return;
    setSaving('review');
    try {
      await apiPost(`/documents/${id}/review`, { decision: reviewDecision, comment: reviewComment });
      showToast({ title: `Document ${reviewDecision.replaceAll('_', ' ')}`, tone: reviewDecision === 'approved' ? 'success' : 'warning' });
      setReviewOpen(false);
      setReviewComment('');
      await refetch();
      await refresh();
    } catch (err) {
      showToast({ title: 'Review failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const upload = async () => {
    if (!id || !attachment || !activeWorkspace) return;
    setSaving('upload');
    const formData = new FormData();
    formData.set('organizationId', activeWorkspace.id);
    formData.set('entityType', 'document');
    formData.set('entityId', id);
    formData.set('file', attachment);
    try {
      await apiUpload('/attachments', formData);
      setAttachment(null);
      showToast({ title: 'Attachment saved', tone: 'success' });
      await refetch();
    } catch (err) {
      showToast({ title: 'Upload failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const archive = async () => {
    if (!id) return;
    setSaving('archive');
    try {
      await apiPatch(`/documents/${id}`, { status: document?.status === 'archived' ? 'draft' : 'archived', changeNote: 'Repository status change.' });
      showToast({ title: document?.status === 'archived' ? 'Document restored' : 'Document archived', tone: 'success' });
      await refetch();
    } catch (err) {
      showToast({ title: 'Archive failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  if (!isNew && loading) return <Spinner label="Loading document editor" />;
  if (!isNew && error) return <Alert tone="error" action={<Button variant="outline" size="sm" onClick={refetch}>Retry</Button>}>{error}</Alert>;
  if (!isNew && !document) return <EmptyState title="Document not found" action={<LinkButton href="/workspace/documents" variant="outline">Back to repository</LinkButton>} />;

  return (
    <div className="stack">
      <PageHeader
        eyebrow={isNew ? 'Manual document editor' : `Document • ${document?.reference || ''}`}
        title={isNew ? 'Create official document' : form.title || 'Untitled document'}
        description="Write content manually or start from a reusable template. All text remains fully editable."
        actions={<><LinkButton href="/workspace/documents" variant="outline" icon={<ArrowLeft className="h-4 w-4" />}>Repository</LinkButton>{document && <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => void downloadApiFile(`/documents/${document.id}/pdf`, `${document.reference}.pdf`)}>Download PDF</Button>}{document && canReview && document.status === 'pending_approval' && <Button variant="gold" icon={<Stamp className="h-4 w-4" />} onClick={() => setReviewOpen(true)}>Review document</Button>}</>}
      />
      {document && <div className="flex flex-wrap items-center gap-2"><StatusBadge status={document.status} /><Badge tone="navy">Version {document.version}</Badge>{document.reviewed_by && <Badge tone="green">Reviewed by {document.reviewer_name}</Badge>}</div>}
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5">
          <SectionHeader title="Document fields" description="These values are stored with the document and used in templates." />
          <div className="mt-4 space-y-4">
            {isNew && <TemplateSelector form={form} onContent={(content) => setForm((current) => ({ ...current, content }))} />}
            <div className="form-grid">
              <Field label="Title" required><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} disabled={!canEdit} required /></Field>
              <Field label="Document type"><Select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} disabled={!canEdit}>{documentKinds.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select></Field>
              <Field label="Category"><Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} disabled={!canEdit} /></Field>
              <Field label="Subject"><Input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} disabled={!canEdit} /></Field>
              <Field label="Recipient"><Input value={form.recipient} onChange={(event) => setForm({ ...form, recipient: event.target.value })} disabled={!canEdit} /></Field>
              <Field label="Tags" hint="Comma-separated"><Input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} disabled={!canEdit} placeholder="correspondence,approved" /></Field>
            </div>
            <Field label="Manual content editor" htmlFor="document-content">
              <div className="mb-2 flex flex-wrap gap-2 no-print">
                <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setForm((current) => ({ ...current, content: `${current.content}\n${new Date().toLocaleDateString('en-GB')}` }))}>Insert date</Button>
                <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setForm((current) => ({ ...current, content: `${current.content}\n\n${user?.name || ''}\n${user?.position || ''}` }))}>Insert signature</Button>
                <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setForm((current) => ({ ...current, content: `${activeWorkspace?.letterhead_name || activeWorkspace?.name?.toUpperCase() || ''}\n${current.content}` }))}>Insert letterhead</Button>
              </div>
              <Textarea id="document-content" rows={18} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} disabled={!canEdit} placeholder="Write the document content here..." className="font-mono text-[13px]" />
            </Field>
            {!isNew && canEdit && <Field label="Change note" hint="Saved with the next version."><Input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} placeholder="What changed in this manual edit?" /></Field>}
            {canEdit && <div className="row-actions no-print"><Button loading={saving === 'save'} icon={<Save className="h-4 w-4" />} onClick={() => void saveDocument(false)}>Save draft</Button><Button variant="gold" loading={saving === 'submit'} icon={<Send className="h-4 w-4" />} onClick={() => void saveDocument(true)}>Submit for approval</Button>{document && <Button variant="outline" loading={saving === 'archive'} onClick={() => void archive()}>{document.status === 'archived' ? 'Restore' : 'Archive'}</Button>}</div>}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5 no-print">
            <SectionHeader title="Live preview" description="Print this preview or download the server-generated PDF." action={<Button size="sm" variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>} />
            <div className="mt-4 max-h-[720px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-100 p-3">
              <PrintableDocument title={form.title || 'Untitled document'} organization={activeWorkspace?.letterhead_name || activeWorkspace?.name || 'SRC Secretariat'} reference={document?.reference} content={form.content} footer="Preview generated from the current editor content." />
            </div>
          </Card>

          {document && (
            <Card className="p-5">
              <SectionHeader title="Version history" description="Every content edit is stored." />
              <div className="mt-4 space-y-2">
                {(document.versions || []).length === 0 && <div className="text-sm text-slate-400">No prior versions.</div>}
                {(document.versions || []).map((version) => (
                  <button key={version.id} className="record-row w-full text-left" onClick={() => setVersionPreview(version)}>
                    <History className="h-4 w-4 text-navy-600" />
                    <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-700">Version {version.version}</div><div className="text-xs text-slate-400">{version.change_note || 'Saved version'} • {formatDateTime(version.created_at)}</div></div>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {document && (
            <Card className="p-5">
              <SectionHeader title="Approval history" description="Reviewer, decision and timestamp." />
              <div className="mt-4"><Timeline items={(document.reviews || []).map((review) => ({ title: titleCase(review.decision), description: `${review.reviewer_name || 'Reviewer'} • ${review.comment || 'No comment'}`, date: formatDateTime(review.created_at) }))} /></div>
            </Card>
          )}

          {document && (
            <Card className="p-5">
              <SectionHeader title="Private attachments" description="Files are checked against this workspace before download." />
              <div className="mt-4 space-y-2">
                {(document.attachments || []).length === 0 && <div className="text-sm text-slate-400">No attachments.</div>}
                {(document.attachments || []).map((file) => <button key={file.id} className="record-row w-full text-left" onClick={() => void downloadApiFile(`/attachments/${file.id}`, file.file_name)}><Paperclip className="h-4 w-4" /><div className="flex-1 truncate text-sm text-slate-700">{file.file_name}</div><Download className="h-4 w-4 text-slate-400" /></button>)}
              </div>
              <div className="mt-4 space-y-2"><input type="file" className="w-full text-xs" onChange={(event) => setAttachment(event.target.files?.[0] || null)} aria-label="Choose document attachment" /><Button size="sm" variant="outline" disabled={!attachment} loading={saving === 'upload'} onClick={() => void upload()}>Upload attachment</Button></div>
            </Card>
          )}
        </div>
      </div>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Presidential document review" description="Record the decision, reviewer and timestamp." footer={<><Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button><Button loading={saving === 'review'} onClick={() => void submitReview()}>Save decision</Button></>}>
        <div className="space-y-4">
          <Field label="Decision"><Select value={reviewDecision} onChange={(event) => setReviewDecision(event.target.value)}><option value="approved">Approve</option><option value="revisions_requested">Request revisions</option><option value="rejected">Reject</option></Select></Field>
          <Field label="Comment" hint="Required when requesting revisions or rejecting."><Textarea rows={4} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Manual review comment" /></Field>
          {document?.content && <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 max-h-52 overflow-y-auto whitespace-pre-wrap">{document.content}</div>}
        </div>
      </Modal>

      <Modal open={Boolean(versionPreview)} onClose={() => setVersionPreview(null)} title={`Version ${versionPreview?.version || ''} content`} description="Read-only saved version." footer={<Button variant="outline" onClick={() => setVersionPreview(null)}>Close</Button>}>
        <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-mono text-xs text-slate-700">{versionPreview?.content}</div>
      </Modal>
    </div>
  );
}

const templateTypes = ['letter', 'notice', 'agenda', 'minutes', 'memo', 'report'];

export function TemplatesPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const [type, setType] = useState('');
  const [editing, setEditing] = useState<Template | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'letter', description: '', body: '', isShared: true });
  const [saving, setSaving] = useState(false);
  const { data, loading, error, refetch } = useApiData<{ templates: Template[] }>('/templates');
  const canManage = Boolean(user?.permissions.includes('manage_templates') || user?.role === 'system_admin');
  const templates = (data?.templates || []).filter((template) => !type || template.type === type);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', type: 'letter', description: '', body: '', isShared: true });
    setModalOpen(true);
  };
  const openEdit = (template: Template) => {
    setEditing(template);
    setForm({ name: template.name, type: template.type, description: template.description, body: template.body, isShared: template.is_shared });
    setModalOpen(true);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) await apiPatch(`/templates/${editing.id}`, { ...form, organizationId: editing.organization_id || activeWorkspace?.id });
      else await apiPost('/templates', { ...form, organizationId: activeWorkspace?.id });
      showToast({ title: editing ? 'Template updated' : 'Template created', tone: 'success' });
      setModalOpen(false);
      await refetch();
    } catch (err) {
      showToast({ title: 'Template could not be saved', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };
  const remove = async (template: Template) => {
    if (!window.confirm(`Delete “${template.name}”? This cannot be undone.`)) return;
    try {
      await apiDelete(`/templates/${template.id}`);
      showToast({ title: 'Template deleted', tone: 'success' });
      await refetch();
    } catch (err) {
      showToast({ title: 'Delete failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    }
  };

  return (
    <div className="stack">
      <PageHeader eyebrow="Reusable templates" title="Letters, notices, agendas & minutes" description="Conventional templates with placeholders. Inserting a template never writes content automatically." actions={canManage ? <Button icon={<FilePlus2 className="h-4 w-4" />} onClick={openCreate}>New template</Button> : undefined} />
      <Card className="p-4"><div className="flex flex-wrap items-center gap-3"><Select value={type} onChange={(event) => setType(event.target.value)} className="w-56"><option value="">All template types</option>{templateTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select><Button variant="outline" onClick={refetch}>Refresh</Button></div></Card>
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <Spinner label="Loading templates" /> : templates.length === 0 ? <EmptyState title="No templates found" description="Create a reusable template for manual document preparation." icon={<BookOpen className="h-6 w-6" />} /> : (
        <div className="grid-cards">
          {templates.map((template) => (
            <Card key={template.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3"><div><Badge tone="navy">{titleCase(template.type)}</Badge>{template.is_shared && <Badge tone="muted" className="ml-2">Shared</Badge>}</div><BookOpen className="h-5 w-5 text-gold-600" /></div>
              <h3 className="mt-4 text-base font-semibold text-navy-900">{template.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{template.description || 'Reusable conventional template.'}</p>
              <div className="mt-3 max-h-28 overflow-hidden whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-mono text-[11px] text-slate-500">{truncate(template.body, 260)}</div>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {['agenda', 'minutes'].includes(template.type) ? <LinkButton href="/workspace/meetings" size="sm" variant="outline">Use in meeting record</LinkButton> : <LinkButton href={`/workspace/documents/new?templateId=${template.id}`} size="sm" icon={<PenLine className="h-4 w-4" />}>Use template</LinkButton>}
                {canManage && <Button size="sm" variant="ghost" onClick={() => openEdit(template)}>Edit</Button>}
                {canManage && <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove(template)} aria-label={`Delete ${template.name}`} />}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit template' : 'Create template'} description="Use {{placeholder}} tokens for values supplied by the editor." size="lg" footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="template-form" loading={saving}>Save template</Button></>}>
        <form id="template-form" onSubmit={save} className="space-y-4">
          <div className="form-grid"><Field label="Name" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field><Field label="Type"><Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{templateTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select></Field></div>
          <Field label="Description"><Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
          <Field label="Template body" required><Textarea rows={14} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} className="font-mono text-xs" placeholder="{{letterhead}}&#10;&#10;Dear {{recipient}}..." required /></Field>
          <label className="toggle-row"><span><span className="block text-sm font-medium text-slate-800">Share with all workspaces</span><span className="text-xs text-slate-500">Administrators can publish shared templates.</span></span><input type="checkbox" className="toggle" checked={form.isShared} onChange={(event) => setForm({ ...form, isShared: event.target.checked })} /></label>
        </form>
      </Modal>
    </div>
  );
}

export function ApprovalsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { refresh } = useRealtime();
  const { data, loading, error, refetch } = useApiData<{ documents: DocumentRecord[] }>('/approvals');
  const [selected, setSelected] = useState<DocumentRecord | null>(null);
  const [decision, setDecision] = useState('approved');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const canReview = Boolean(user?.permissions.includes('review_documents') || user?.role === 'system_admin');

  const review = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await apiPost(`/documents/${selected.id}/review`, { decision, comment });
      showToast({ title: `Document ${decision.replaceAll('_', ' ')}`, tone: decision === 'approved' ? 'success' : 'warning' });
      setSelected(null);
      setComment('');
      await refetch();
      await refresh();
    } catch (err) {
      showToast({ title: 'Review failed', description: err instanceof Error ? err.message : undefined, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <PageHeader eyebrow="Presidential document approvals" title="Approval queue" description="Review submitted letters, minutes, reports, proposals, notices and event plans." actions={<LinkButton href="/workspace/documents" variant="outline" icon={<FolderIcon />}>Document repository</LinkButton>} />
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <Spinner label="Loading approvals" /> : (data?.documents || []).length === 0 ? <EmptyState title="No documents awaiting approval" description="Submitted documents appear here with their full review history." icon={<Stamp className="h-6 w-6" />} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.documents.map((document) => (
            <Card key={document.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between"><Badge tone="gold">{titleCase(document.kind)}</Badge><StatusBadge status={document.status} /></div>
              <h3 className="mt-4 text-base font-semibold text-navy-900">{document.title}</h3>
              <div className="mt-1 text-xs text-slate-400">{document.reference} • by {document.author_name} • v{document.version}</div>
              <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-slate-600">{truncate(document.content, 260)}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <Button size="sm" onClick={() => { setSelected(document); setDecision('approved'); setComment(''); }} disabled={!canReview}>Review</Button>
                <LinkButton href={`/workspace/documents/${document.id}`} size="sm" variant="outline">Open</LinkButton>
                <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => void downloadApiFile(`/documents/${document.id}/pdf`, `${document.reference}.pdf`)} aria-label="Download PDF" />
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Review submitted document" description={`${selected?.reference || ''} • reviewer and timestamp are recorded.`} size="lg" footer={<><Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button><Button loading={saving} onClick={() => void review()}>Save decision</Button></>}>
        <div className="space-y-4">
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-mono text-xs text-slate-700">{selected?.content}</div>
          <Field label="Decision"><Select value={decision} onChange={(event) => setDecision(event.target.value)}><option value="approved">Approve</option><option value="revisions_requested">Request revisions</option><option value="rejected">Reject</option></Select></Field>
          <Field label="Comment" hint="Required when returning a document."><Textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}

function FolderIcon() {
  return <FileText className="h-4 w-4" />;
}
