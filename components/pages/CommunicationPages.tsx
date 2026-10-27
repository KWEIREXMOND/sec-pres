'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  Check,
  CheckCheck,
  Mail,
  MessageCircle,
  MessageSquareText,
  Megaphone,
  Phone,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Users,
} from 'lucide-react';
import type { Announcement, DeliveryLog, DirectoryEntry, Message, Notification, Role } from '@/lib/shared-types';
import { BRAND } from '@/lib/brand';
import { apiPatch, apiPost } from '@/lib/api';
import { useApiData } from '@/lib/hooks';
import { useAuth, useRealtime, useToast, useWorkspace } from '@/components/providers';
import { formatDateTime, relativeTime, safeHref, titleCase, truncate } from '@/lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, LinkButton, Modal, PageHeader, SearchInput, SectionHeader, Select, Spinner, StatusBadge, TableWrap, Tabs, Textarea, Toggle } from '@/components/ui';

const roles: Role[] = ['zonal_president', 'school_president', 'zonal_secretary', 'school_secretary', 'vice_president', 'executive', 'system_admin'];

function MessageComposer({ open, onClose, initialRecipient, initialSubject, initialHelp, onSent }: { open: boolean; onClose: () => void; initialRecipient?: string; initialSubject?: string; initialHelp?: string; onSent: () => void }) {
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const { data: directory } = useApiData<{ people: DirectoryEntry[] }>('/directory', { enabled: open });
  const [recipientId, setRecipientId] = useState(initialRecipient || '');
  const [subject, setSubject] = useState(initialSubject || '');
  const [body, setBody] = useState('');
  const [helpRequestId, setHelpRequestId] = useState(initialHelp || '');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRecipientId(initialRecipient || '');
    setSubject(initialSubject || '');
    setBody('');
    setHelpRequestId(initialHelp || '');
  }, [open, initialRecipient, initialSubject, initialHelp]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeWorkspace) return;
    setSending(true);
    try {
      const result = await apiPost<{ message: Message; delivery: string }>('/messages', { organizationId: activeWorkspace.id, recipientId, subject, body, helpRequestId: helpRequestId || null });
      showToast({ title: 'In-app message saved', description: result.delivery, tone: 'success' });
      setBody('');
      onClose();
      onSent();
    } catch (error) {
      showToast({ title: 'Message could not be sent', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Compose in-app message" description="Messages are saved with delivery and read timestamps. External channels are reported separately." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="message-form" loading={sending} icon={<Send className="h-4 w-4" />}>Send message</Button></>}>
      <form id="message-form" onSubmit={send} className="space-y-4">
        <Field label="Recipient" required><Select value={recipientId} onChange={(event) => setRecipientId(event.target.value)} required><option value="">Select recipient</option>{(directory?.people || []).map((person) => <option key={person.id} value={person.id}>{person.name} • {person.position}</option>)}</Select></Field>
        <Field label="Subject"><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Optional subject" /></Field>
        <Field label="Related HELP request" hint="Optional. Links the message to a request conversation."><Input value={helpRequestId} onChange={(event) => setHelpRequestId(event.target.value)} placeholder="HELP request id" /></Field>
        <Field label="Message" required><Textarea rows={6} value={body} onChange={(event) => setBody(event.target.value)} required /></Field>
        <Alert tone="info">This saves an in-app message and triggers the recipient’s notification preferences. Email, SMS, WhatsApp and browser delivery are shown in the delivery log.</Alert>
      </form>
    </Modal>
  );
}

function AnnouncementModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const [form, setForm] = useState({ title: '', body: '', audience: 'all', isPinned: false });
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeWorkspace) return;
    setSaving(true);
    try {
      const result = await apiPost<{ message: string; recipients: number }>('/announcements', { organizationId: activeWorkspace.id, ...form });
      showToast({ title: 'Announcement published', description: `${result.message} ${result.recipients} recipient(s) notified in-app.`, tone: 'success' });
      setForm({ title: '', body: '', audience: 'all', isPinned: false });
      onClose();
      onSaved();
    } catch (error) {
      showToast({ title: 'Announcement failed', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Publish executive announcement" description="Saved to the workspace and delivered according to each member’s preferences." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="announcement-form" loading={saving} icon={<Megaphone className="h-4 w-4" />}>Publish</Button></>}>
      <form id="announcement-form" onSubmit={submit} className="space-y-4">
        <Field label="Title" required><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></Field>
        <Field label="Audience"><Select value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })}><option value="all">All workspace members</option><option value="executives">Executives only</option><option value="secretaries">Secretaries only</option></Select></Field>
        <Field label="Message" required><Textarea rows={5} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} required /></Field>
        <Toggle checked={form.isPinned} onChange={(checked) => setForm({ ...form, isPinned: checked })} label="Pin announcement" description="Pinned announcements appear first on dashboards." />
      </form>
    </Modal>
  );
}

export function CommunicationPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { refresh } = useRealtime();
  const [tab, setTab] = useState('messages');
  const [box, setBox] = useState('inbox');
  const [composerOpen, setComposerOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [initialRecipient, setInitialRecipient] = useState('');
  const [initialSubject, setInitialSubject] = useState('');
  const [initialHelp, setInitialHelp] = useState('');
  const { data: messagesData, loading: messagesLoading, refetch: refreshMessages } = useApiData<{ messages: Message[]; unreadCount: number }>(`/messages?box=${box}`);
  const { data: announcementsData, loading: announcementsLoading, refetch: refreshAnnouncements } = useApiData<{ announcements: Announcement[] }>('/announcements');
  const canAnnounce = Boolean(user?.permissions.includes('create_announcements') || user?.role === 'system_admin');

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('compose') === '1') {
      setInitialRecipient(query.get('to') || '');
      setInitialSubject(query.get('subject') || '');
      setInitialHelp(query.get('help') || '');
      setComposerOpen(true);
    }
  }, []);

  const markRead = async (message: Message) => {
    try {
      await apiPatch(`/messages/${message.id}/read`);
      await refreshMessages();
      await refresh();
    } catch (error) {
      showToast({ title: 'Could not mark message read', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    }
  };

  return (
    <div className="stack">
      <PageHeader eyebrow="Communication centre" title="Messages & announcements" description="In-app conversations, executive announcements and registered contact actions." actions={<><Button icon={<MessageSquareText className="h-4 w-4" />} onClick={() => { setInitialRecipient(''); setInitialSubject(''); setInitialHelp(''); setComposerOpen(true); }}>Compose message</Button>{canAnnounce && <Button variant="outline" icon={<Megaphone className="h-4 w-4" />} onClick={() => setAnnouncementOpen(true)}>New announcement</Button>}</>} />
      <Tabs active={tab} onChange={setTab} tabs={[{ id: 'messages', label: 'Messages', count: messagesData?.unreadCount }, { id: 'announcements', label: 'Announcements', count: announcementsData?.announcements.length }]} />
      {tab === 'messages' && (
        <div className="space-y-4">
          <Card className="p-4"><div className="flex flex-wrap items-center gap-3"><Select value={box} onChange={(event) => setBox(event.target.value)} className="w-48"><option value="inbox">Inbox</option><option value="sent">Sent</option><option value="all">All messages</option></Select><Button variant="outline" icon={<RefreshCcw className="h-4 w-4" />} onClick={refreshMessages}>Refresh</Button><Badge tone="navy">{messagesData?.unreadCount || 0} unread</Badge></div></Card>
          {messagesLoading ? <Spinner label="Loading messages" /> : (messagesData?.messages || []).length === 0 ? <EmptyState title="No messages" description="Compose an in-app message to a workspace member." icon={<MessageSquareText className="h-6 w-6" />} /> : (
            <Card className="divide-y divide-slate-100 overflow-hidden">
              {(messagesData?.messages || []).map((message) => (
                <div key={message.id} className={`p-4 ${!message.read_at && message.recipient_id === user?.id ? 'bg-navy-50/40' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-800">{message.subject || '(No subject)'}</div><div className="mt-1 text-xs text-slate-400">{box === 'sent' ? `To ${message.recipient_name}` : `From ${message.sender_name}`} • {formatDateTime(message.created_at)}</div></div><div className="row-actions"><Badge tone={message.read_at ? 'green' : 'gold'}>{message.read_at ? `Read ${relativeTime(message.read_at)}` : `Delivered ${relativeTime(message.delivered_at)}`}</Badge>{!message.read_at && message.recipient_id === user?.id && <Button size="sm" variant="outline" icon={<Check className="h-3.5 w-3.5" />} onClick={() => void markRead(message)}>Mark read</Button>}<Button size="sm" variant="ghost" onClick={() => { setInitialRecipient(message.sender_id === user?.id ? message.recipient_id : message.sender_id); setInitialSubject(`Re: ${message.subject || 'Message'}`); setInitialHelp(message.help_request_id || ''); setComposerOpen(true); }}>Reply</Button></div></div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{message.body}</p>
                  {message.help_request_id && <Link href={`/workspace/help/${message.help_request_id}`} className="mt-2 inline-block text-xs font-semibold text-navy-700 hover:underline">View related HELP request</Link>}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
      {tab === 'announcements' && (
        announcementsLoading ? <Spinner label="Loading announcements" /> : (announcementsData?.announcements || []).length === 0 ? <EmptyState title="No announcements" description="Publish an executive announcement for this workspace." icon={<Megaphone className="h-6 w-6" />} /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {(announcementsData?.announcements || []).map((announcement) => <Card key={announcement.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Badge tone="gold">{titleCase(announcement.audience)}</Badge>{announcement.is_pinned && <Badge tone="red">Pinned</Badge>}</div><h3 className="mt-3 text-base font-semibold text-navy-900">{announcement.title}</h3></div><Megaphone className="h-5 w-5 text-gold-600" /></div><p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{announcement.body}</p><div className="mt-4 text-xs text-slate-400">{announcement.author_name} • {formatDateTime(announcement.created_at)}</div></Card>)}
          </div>
        )
      )}
      <MessageComposer open={composerOpen} onClose={() => setComposerOpen(false)} initialRecipient={initialRecipient} initialSubject={initialSubject} initialHelp={initialHelp} onSent={() => { void refreshMessages(); void refresh(); }} />
      <AnnouncementModal open={announcementOpen} onClose={() => setAnnouncementOpen(false)} onSaved={() => { void refreshAnnouncements(); void refresh(); }} />
    </div>
  );
}

export function DirectoryPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (role) params.set('role', role);
  if (status) params.set('status', status);
  const { data, loading, error, refetch } = useApiData<{ people: DirectoryEntry[]; contactAccess: boolean }>(`/directory${params.toString() ? `?${params}` : ''}`);
  return (
    <div className="stack">
      <PageHeader eyebrow="Executive directory" title="Authorized SRC executives" description="Search positions, committees and responsibilities. Confidential contact details are masked for unauthorized roles." />
      <Card className="p-4"><div className="grid gap-3 md:grid-cols-[1fr_220px_160px_auto]"><SearchInput value={search} onChange={setSearch} placeholder="Search name, position or committee" /><Select value={role} onChange={(event) => setRole(event.target.value)}><option value="">All roles</option>{roles.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</Select><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All accounts</option><option value="active">Active</option><option value="inactive">Inactive</option></Select><Button variant="outline" onClick={refetch}>Refresh</Button></div></Card>
      {!data?.contactAccess && <Alert tone="warning" title="Restricted contact details">Some telephone numbers and email addresses are masked because your role does not have contact-details permission.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? <Spinner label="Loading directory" /> : (data?.people || []).length === 0 ? <EmptyState title="No executives found" description="Adjust your filters." icon={<Users className="h-6 w-6" />} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(data?.people || []).map((person) => {
            const canContact = person.phone.includes('+');
            const whatsappMessage = `Hello ${person.name}, I am contacting you through ${BRAND.name}.`;
            return (
              <Card key={person.id} className="p-5">
                <div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-navy-900">{person.name}</h3><div className="mt-1 text-xs text-slate-500">{person.position}</div></div><StatusBadge status={person.is_active ? 'active' : 'inactive'} /></div>
                <div className="mt-3 space-y-1 text-xs text-slate-500"><div><Badge tone="navy">{titleCase(person.role)}</Badge></div><div>{person.organization}</div><div>{person.committee || 'No committee assigned'}</div><div className="mt-2">{truncate(person.responsibilities || 'No responsibilities recorded.', 100)}</div></div>
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{person.phone || 'Restricted'}</div><div className="mt-1 flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{person.email}</div></div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <LinkButton href={`/workspace/communication?compose=1&to=${person.id}`} size="sm" icon={<MessageSquareText className="h-4 w-4" />}>In-app message</LinkButton>
                  {canContact && <a className="btn border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" href={safeHref(`tel:${person.phone}`)}><Phone className="h-3.5 w-3.5" /> Dialler</a>}
                  {canContact && <a className="btn border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" href={safeHref(`sms:${person.phone}`)}><Smartphone className="h-3.5 w-3.5" /> SMS</a>}
                  {canContact && <a className="btn border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" target="_blank" rel="noreferrer" href={`https://wa.me/${person.whatsapp_number?.replace(/\D/g, '') || person.phone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NotificationsPage() {
  const { user } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead, refresh, connected, mode } = useRealtime();
  const { showToast } = useToast();
  const [tab, setTab] = useState('inbox');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [maintenanceSummary, setMaintenanceSummary] = useState<string | null>(null);
  const { data: providerData } = useApiData<{ providers: Array<{ channel: string; configured: boolean }> }>('/provider-status');
  const { data: deliveryData, refetch: refreshDeliveries } = useApiData<{ deliveries: Array<DeliveryLog & { user_name?: string; notification_title?: string | null }>; providers: Array<{ channel: string; configured: boolean }> }>(tab === 'deliveries' ? '/notification-deliveries' : null, { enabled: tab === 'deliveries' });
  const canViewLogs = Boolean(user?.permissions.includes('view_delivery_logs') || user?.role === 'system_admin');
  const canMaintain = Boolean(user?.permissions.includes('run_maintenance') || user?.role === 'system_admin');
  const visibleNotifications = unreadOnly ? notifications.filter((item) => !item.is_read) : notifications;

  const runMaintenance = async () => {
    setMaintenanceLoading(true);
    setMaintenanceSummary(null);
    try {
      const result = await apiPost<{ summary: { overdueTasksMarked: number; taskReminders: number; meetingReminders: number; escalatedHelpRequests: number; deliveryRetries: number } }>('/maintenance/run');
      setMaintenanceSummary(`${result.summary.overdueTasksMarked} overdue task(s), ${result.summary.taskReminders} task reminder(s), ${result.summary.meetingReminders} meeting reminder(s), ${result.summary.escalatedHelpRequests} escalation(s), ${result.summary.deliveryRetries} retry attempt(s).`);
      showToast({ title: 'Maintenance completed', tone: 'success' });
      await refresh();
      await refreshDeliveries();
    } catch (error) {
      showToast({ title: 'Maintenance failed', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const tabs = [{ id: 'inbox', label: 'Inbox', count: unreadCount }, { id: 'providers', label: 'Channels' }, ...(canViewLogs ? [{ id: 'deliveries', label: 'Delivery logs' }] : [])];

  return (
    <div className="stack">
      <PageHeader eyebrow="Notification centre" title="Notifications & delivery records" description="In-app alerts, real-time status and honest external delivery logs." actions={<><Badge tone={connected ? 'green' : 'gold'}>{connected ? 'Live connection' : `${titleCase(mode)} fallback`}</Badge><Button variant="outline" icon={<CheckCheck className="h-4 w-4" />} onClick={() => void markAllRead()}>Mark all read</Button></>} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'inbox' && (
        <div className="space-y-4">
          <Card className="p-4"><div className="flex flex-wrap items-center gap-3"><Toggle checked={unreadOnly} onChange={setUnreadOnly} label="Show unread only" /><Button variant="outline" icon={<RefreshCcw className="h-4 w-4" />} onClick={() => void refresh()}>Refresh</Button><Badge tone="navy">{unreadCount} unread</Badge></div></Card>
          {visibleNotifications.length === 0 ? <EmptyState title="No notifications" description="New HELP requests, approvals, meetings and tasks will appear here." icon={<Bell className="h-6 w-6" />} /> : (
            <Card className="divide-y divide-slate-100 overflow-hidden">
              {visibleNotifications.map((notification: Notification) => <div key={notification.id} className={`p-4 ${!notification.is_read ? 'bg-navy-50/40' : ''}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><StatusBadge status={notification.severity} /><div className="truncate text-sm font-semibold text-slate-800">{notification.title}</div>{!notification.is_read && <span className="h-2 w-2 rounded-full bg-red-500" />}</div><p className="mt-2 text-sm text-slate-600">{notification.body}</p><div className="mt-1 text-xs text-slate-400">{titleCase(notification.type)} • {formatDateTime(notification.created_at)}</div></div><div className="row-actions">{notification.link && <LinkButton href={notification.link} size="sm" variant="outline">Open record</LinkButton>}{!notification.is_read && <Button size="sm" variant="ghost" icon={<Check className="h-3.5 w-3.5" />} onClick={() => void markRead(notification.id)}>Mark read</Button>}</div></div></div>)}
            </Card>
          )}
        </div>
      )}
      {tab === 'providers' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(providerData?.providers || []).map((provider) => <Card key={provider.channel} className="p-5"><div className="flex items-center justify-between"><div><div className="text-sm font-semibold text-navy-900">{titleCase(provider.channel)}</div><div className="mt-1 text-xs text-slate-500">{provider.channel === 'in_app' ? 'Always stored in the database and pushed over the live channel.' : 'Attempted only when all server-side credentials are configured.'}</div></div><Badge tone={provider.configured ? 'green' : 'muted'}>{provider.configured ? 'Configured' : 'Not configured'}</Badge></div></Card>)}
          {canMaintain && <Card className="p-5"><SectionHeader title="Scheduled checks" description="Run the same checks as the server cron job." /><Button className="mt-4" loading={maintenanceLoading} icon={<RefreshCcw className="h-4 w-4" />} onClick={() => void runMaintenance()}>Run maintenance now</Button>{maintenanceSummary && <div className="mt-3"><Alert tone="success" title="Completed">{maintenanceSummary}</Alert></div>}<p className="mt-3 text-xs text-slate-400">Escalation period and provider credentials are documented in the setup guide.</p></Card>}
        </div>
      )}
      {tab === 'deliveries' && (
        <div className="space-y-4">
          <Alert tone="info" title="No simulated success">Only provider-confirmed responses are marked sent. Failures, retries and missing configuration are recorded.</Alert>
          <Card className="overflow-hidden">{!deliveryData?.deliveries.length ? <EmptyState title="No delivery records" description="Delivery attempts appear after notifications are created." /> : <TableWrap className="rounded-none border-0"><table className="data-table"><thead><tr><th>Recipient</th><th>Channel</th><th>Provider</th><th>Status</th><th>Attempts</th><th>Result</th><th>Time</th></tr></thead><tbody>{deliveryData.deliveries.map((log) => <tr key={log.id}><td><div className="font-medium text-slate-700">{log.user_name || log.user_id}</div><div className="text-xs text-slate-400">{truncate(log.notification_title || log.recipient, 60)}</div></td><td>{titleCase(log.channel)}</td><td>{log.provider}</td><td><StatusBadge status={log.status} /></td><td>{log.attempts}</td><td className="max-w-xs truncate">{log.last_error || log.provider_message_id || '—'}</td><td>{formatDateTime(log.sent_at || log.created_at)}</td></tr>)}</tbody></table></TableWrap>}</Card>
        </div>
      )}
    </div>
  );
}
