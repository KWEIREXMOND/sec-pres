'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, MapPin, Paperclip, Siren } from 'lucide-react';
import { apiPost, apiUpload } from '@/lib/api';
import { useRealtime, useToast, useWorkspace } from '@/components/providers';
import { Alert, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';

interface CreatedHelp {
  id: string;
  reference: string;
}

interface CreateHelpResult {
  request: CreatedHelp;
  reference: string;
  assignedTo: string | null;
  duplicate: boolean;
  message: string;
  deliveryStatus?: Array<{ channel: string; status: string; count: number }>;
}

function newClientRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `help-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function HelpQuickModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: () => void }) {
  const { activeWorkspace } = useWorkspace();
  const { refresh } = useRealtime();
  const { showToast } = useToast();
  const [requestType, setRequestType] = useState('Urgent Assistance');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState('urgent');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [clientRequestId, setClientRequestId] = useState(newClientRequestId());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateHelpResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setRequestType('Urgent Assistance');
    setSubject('');
    setDescription('');
    setLocation('');
    setPriority('urgent');
    setAttachment(null);
    setClientRequestId(newClientRequestId());
    setError(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeWorkspace || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await apiPost<CreateHelpResult>('/help-requests', {
        organizationId: activeWorkspace.id,
        clientRequestId,
        requestType,
        subject,
        description,
        location,
        priority,
        channel: 'in_app',
      });
      if (attachment) {
        const form = new FormData();
        form.set('organizationId', activeWorkspace.id);
        form.set('entityType', 'help_request');
        form.set('entityId', created.request.id);
        form.set('file', attachment);
        try {
          await apiUpload('/attachments', form);
        } catch (uploadError) {
          showToast({ title: 'Request saved; attachment not uploaded', description: uploadError instanceof Error ? uploadError.message : undefined, tone: 'warning' });
        }
      }
      setResult(created);
      await refresh();
      onCreated?.();
      showToast({ title: `HELP ${created.reference} submitted`, description: 'Saved and routed to the Secretariat inbox.', tone: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={result ? 'HELP request submitted' : 'HELP! I NEED MY SECRETARY'}
      description={result ? 'The request is saved in the database with a unique reference.' : 'Complete the form below. Your location is entered manually; location tracking is not used.'}
      size="lg"
      footer={result ? (
        <>
          <Link href={`/workspace/help/${result.request.id}`} className="btn bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800" onClick={onClose}>View request tracking</Link>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </>
      ) : (
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" form="help-request-form" variant="danger" loading={submitting} icon={<Siren className="h-4 w-4" />}>Submit urgent request</Button>
        </>
      )}
    >
      {result ? (
        <div className="space-y-4">
          <Alert tone="success" title={`Reference ${result.reference}`}>{result.message}</Alert>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-navy-900"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Routing and delivery record</div>
            <p className="mt-1 text-xs text-slate-500">{result.assignedTo ? 'The designated Secretary was assigned.' : 'No designated Secretary is configured; primary secretaries were notified.'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(result.deliveryStatus || []).map((item) => (
                <span key={`${item.channel}-${item.status}`} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {item.channel}: {item.status} ({item.count})
                </span>
              ))}
              {!result.deliveryStatus?.length && <span className="text-xs text-slate-500">In-app notification saved; external channels are not configured.</span>}
            </div>
          </div>
          <p className="text-xs text-slate-500">External email, SMS, WhatsApp and browser alerts are reported only when a provider confirms delivery. In-app records are always saved.</p>
        </div>
      ) : (
        <form id="help-request-form" onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-800">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> This button is for urgent presidential assistance. Repeated clicks will not create duplicates.
          </div>
          <div className="form-grid">
            <Field label="Request type" htmlFor="help-type" required>
              <Select id="help-type" value={requestType} onChange={(event) => setRequestType(event.target.value)} required>
                <option>Urgent Assistance</option>
                <option>Document Retrieval</option>
                <option>Meeting Support</option>
                <option>Communication Support</option>
                <option>Other Presidential Assistance</option>
              </Select>
            </Field>
            <Field label="Priority" htmlFor="help-priority" required>
              <Select id="help-priority" value={priority} onChange={(event) => setPriority(event.target.value)} required>
                <option value="critical">Critical</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
              </Select>
            </Field>
          </div>
          <Field label="Subject" htmlFor="help-subject" required>
            <Input id="help-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Briefly state what you need" maxLength={200} required />
          </Field>
          <Field label="Detailed description" htmlFor="help-description" required>
            <Textarea id="help-description" rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the assistance required, including any deadline." maxLength={1000} required />
          </Field>
          <Field label="Current location" htmlFor="help-location" hint="Entered manually by the President. No location tracking is used." required>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input id="help-location" className="pl-10" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Presidential Office, first floor" required />
            </div>
          </Field>
          <Field label="Supporting attachment" htmlFor="help-attachment" hint="Optional. PDF, image, text or Word documents up to 5 MB.">
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
              <Paperclip className="h-5 w-5 text-slate-400" />
              <input ref={fileRef} id="help-attachment" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx" onChange={(event) => setAttachment(event.target.files?.[0] || null)} className="w-full text-xs text-slate-600" />
              {attachment && <button type="button" className="text-xs font-semibold text-red-600" onClick={() => { setAttachment(null); if (fileRef.current) fileRef.current.value = ''; }}>Remove</button>}
            </div>
          </Field>
        </form>
      )}
    </Modal>
  );
}
