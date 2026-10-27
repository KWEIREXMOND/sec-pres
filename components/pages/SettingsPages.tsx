'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  KeyRound,
  Laptop,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCcw,
  Save,
  Shield,
  ShieldCheck,
  UserCog,
  Users,
  Wifi,
} from 'lucide-react';
import type { AdminUser, AuditLog, DeliveryLog, NotificationPreferences, Organization, Role, UserSession } from '@/lib/shared-types';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api';
import { useApiData } from '@/lib/hooks';
import { useAuth, useToast, useWorkspace } from '@/components/providers';
import { formatDateTime, titleCase, truncate } from '@/lib/format';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Field, Input, LinkButton, Modal, PageHeader, SearchInput, SectionHeader, Select, Spinner, StatusBadge, TableWrap, Tabs, Textarea, Toggle } from '@/components/ui';

const roles: Role[] = ['zonal_president', 'school_president', 'zonal_secretary', 'school_secretary', 'vice_president', 'executive', 'system_admin'];

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function PushSettings() {
  const { showToast } = useToast();
  const { data, refetch } = useApiData<{ publicKey: string | null; configured: boolean }>('/push/public-key');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Checking browser support…');

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (!cancelled) setStatus('Browser push is not supported on this device.');
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) {
          setSubscription(existing);
          setStatus(existing ? 'Browser alerts are enabled on this device.' : 'Browser alerts are not enabled on this device.');
        }
      } catch {
        if (!cancelled) setStatus('The browser push service worker could not be registered.');
      }
    };
    void check();
    return () => { cancelled = true; };
  }, []);

  const enable = async () => {
    if (!data?.configured || !data.publicKey) {
      showToast({ title: 'Browser push is not configured', description: 'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT on the server.', tone: 'warning' });
      return;
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      showToast({ title: 'Browser push is not supported', tone: 'warning' });
      return;
    }
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      const registration = await navigator.serviceWorker.ready;
      const next = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.publicKey) as BufferSource });
      const json = next.toJSON();
      await apiPost('/push/subscribe', { endpoint: next.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } });
      setSubscription(next);
      setStatus('Browser alerts are enabled on this device.');
      showToast({ title: 'Browser alerts enabled', description: 'Delivery attempts will be recorded in the notification log.', tone: 'success' });
      await refetch();
    } catch (error) {
      showToast({ title: 'Browser alerts could not be enabled', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    setLoading(true);
    try {
      if (subscription) await subscription.unsubscribe();
      await apiDelete('/push/subscribe', subscription ? { endpoint: subscription.endpoint } : undefined);
      setSubscription(null);
      setStatus('Browser alerts are disabled on this device.');
      showToast({ title: 'Browser alerts disabled', tone: 'success' });
    } catch (error) {
      showToast({ title: 'Browser alerts could not be disabled', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-5">
      <SectionHeader title="Browser push alerts" description="Optional Web Push channel using server-side VAPID keys." />
      <div className="mt-4 space-y-3">
        <Alert tone={data?.configured ? 'info' : 'warning'}>{status} {data?.configured ? 'Server keys are configured.' : 'Server VAPID keys are not configured.'}</Alert>
        <div className="row-actions">{subscription ? <Button variant="outline" loading={loading} onClick={() => void disable()}>Disable browser alerts</Button> : <Button loading={loading} disabled={!data?.configured} icon={<BellRing className="h-4 w-4" />} onClick={() => void enable()}>Enable browser alerts</Button>}</div>
        <p className="text-xs text-slate-400">A successful provider response is required before a push delivery is marked sent. Failed attempts remain in the delivery log.</p>
      </div>
    </Card>
  );
}

function ProfileSettings() {
  const { user, refresh } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '', whatsapp_number: user?.whatsapp_number || '', committee: user?.committee || '', responsibilities: user?.responsibilities || '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!user) return;
    setForm({ name: user.name, phone: user.phone, whatsapp_number: user.whatsapp_number || '', committee: user.committee || '', responsibilities: user.responsibilities || '' });
  }, [user]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await apiPatch('/profile', form);
      await refresh();
      showToast({ title: 'Profile updated', tone: 'success' });
    } catch (error) {
      showToast({ title: 'Profile update failed', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card className="p-5">
      <SectionHeader title="Profile & contact information" description="Official contact details used for call and messaging actions." />
      <form onSubmit={save} className="mt-4 space-y-4">
        <div className="form-grid"><Field label="Full name" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field><Field label="Registered telephone" required><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></Field><Field label="WhatsApp number"><Input value={form.whatsapp_number} onChange={(event) => setForm({ ...form, whatsapp_number: event.target.value })} /></Field><Field label="Committee"><Input value={form.committee} onChange={(event) => setForm({ ...form, committee: event.target.value })} /></Field></div>
        <Field label="Responsibilities"><Textarea rows={3} value={form.responsibilities} onChange={(event) => setForm({ ...form, responsibilities: event.target.value })} /></Field>
        <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>Save profile</Button>
      </form>
    </Card>
  );
}

function SecuritySettings() {
  const { logout } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      showToast({ title: 'Passwords do not match', tone: 'error' });
      return;
    }
    setSaving(true);
    try {
      const result = await apiPost<{ message: string }>('/profile/password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showToast({ title: 'Password updated', description: result.message, tone: 'success' });
    } catch (error) {
      showToast({ title: 'Password update failed', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };
  const logoutAll = async () => {
    await apiPost('/auth/logout-all');
    await logout();
    window.location.href = '/login';
  };
  return (
    <div className="space-y-4">
      <Card className="p-5"><SectionHeader title="Change password" description="Other active sessions are revoked after a successful change." /><form onSubmit={submit} className="mt-4 space-y-4"><div className="form-grid-3"><Field label="Current password" required><Input type="password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} required /></Field><Field label="New password" required><Input type="password" minLength={10} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} required /></Field><Field label="Confirm new password" required><Input type="password" minLength={10} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required /></Field></div><Button type="submit" loading={saving} icon={<KeyRound className="h-4 w-4" />}>Update password</Button></form></Card>
      <Card className="p-5"><SectionHeader title="Session security" description="Sign out all devices if you suspect account misuse." /><Button className="mt-4" variant="outline" icon={<LogOut className="h-4 w-4" />} onClick={() => void logoutAll()}>Sign out all sessions</Button></Card>
      <PushSettings />
    </div>
  );
}

function PreferenceSettings() {
  const { data, refetch } = useApiData<{ preferences: NotificationPreferences }>('/profile/preferences');
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data?.preferences) setPrefs(data.preferences); }, [data]);
  if (!prefs) return <Spinner label="Loading preferences" />;
  const save = async () => {
    setSaving(true);
    try {
      await apiPatch('/profile/preferences', prefs);
      showToast({ title: 'Notification preferences saved', tone: 'success' });
      await refetch();
    } catch (error) {
      showToast({ title: 'Preferences could not be saved', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };
  const entries: Array<[keyof NotificationPreferences, string, string]> = [
    ['in_app', 'In-app notifications', 'Always keep a copy in the notification centre.'],
    ['email', 'Email', 'Attempt configured email delivery for alerts.'],
    ['sms', 'SMS', 'Attempt configured SMS delivery for alerts.'],
    ['whatsapp', 'WhatsApp', 'Attempt configured WhatsApp delivery for alerts.'],
    ['push', 'Browser push', 'Attempt configured Web Push delivery for alerts.'],
    ['meeting_reminders', 'Meeting reminders', 'Receive meeting and attendance reminders.'],
    ['task_reminders', 'Task reminders', 'Receive due and overdue task reminders.'],
    ['help_alerts', 'HELP alerts', 'Receive urgent HELP request alerts.'],
  ];
  return (
    <Card className="p-5"><SectionHeader title="Notification preferences" description="External channels are attempted only when fully configured and never reported as successful without provider confirmation." /><div className="mt-4 grid gap-3 md:grid-cols-2">{entries.map(([key, label, description]) => <Toggle key={key} checked={prefs[key]} onChange={(checked) => setPrefs({ ...prefs, [key]: checked })} label={label} description={description} />)}</div><Button className="mt-5" loading={saving} icon={<Save className="h-4 w-4" />} onClick={() => void save()}>Save preferences</Button></Card>
  );
}

function SessionSettings() {
  const { data, loading, refetch } = useApiData<{ sessions: UserSession[] }>('/profile/sessions');
  const { showToast } = useToast();
  const revoke = async (session: UserSession) => {
    try {
      const result = await apiDelete<{ currentSessionRevoked: boolean }>(`/profile/sessions/${session.id}`);
      showToast({ title: 'Session revoked', tone: 'success' });
      await refetch();
      if (result.currentSessionRevoked) window.location.href = '/login';
    } catch (error) {
      showToast({ title: 'Session could not be revoked', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    }
  };
  return (
    <Card className="p-5"><SectionHeader title="Active sessions" description="Devices with a valid HTTP-only session cookie." />{loading ? <Spinner label="Loading sessions" /> : <div className="mt-4 space-y-3">{(data?.sessions || []).length === 0 && <div className="text-sm text-slate-400">No active sessions.</div>}{(data?.sessions || []).map((session) => <div key={session.id} className="record-row"><Laptop className="h-4 w-4 text-navy-600" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-800">{session.device || 'Unknown device'} {session.is_current && <Badge tone="green" className="ml-2">This device</Badge>}</div><div className="text-xs text-slate-400">{session.ip_address || 'IP not recorded'} • last seen {formatDateTime(session.last_seen_at)} • expires {formatDateTime(session.expires_at)}</div></div><Button size="sm" variant="outline" onClick={() => void revoke(session)}>Revoke</Button></div>)}</div>}</Card>
  );
}

function WorkspaceSettings() {
  const { activeWorkspace, organizations, setActiveWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [settings, setSettings] = useState({ letterheadName: '', address: '', phone: '', email: '', motto: '', region: '' });
  const [saving, setSaving] = useState(false);
  const canEdit = Boolean(user?.permissions.includes('manage_settings') || user?.role === 'system_admin');
  useEffect(() => {
    if (!activeWorkspace) return;
    setSettings({ letterheadName: activeWorkspace.letterhead_name, address: activeWorkspace.address, phone: activeWorkspace.phone, email: activeWorkspace.email, motto: activeWorkspace.motto, region: activeWorkspace.region });
  }, [activeWorkspace]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await apiPatch(`/organizations/${activeWorkspace?.id}/settings`, settings);
      showToast({ title: 'Workspace settings saved', description: 'Refresh the page to update the cached workspace record.', tone: 'success' });
    } catch (error) {
      showToast({ title: 'Settings could not be saved', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-4">
      <Card className="p-5"><SectionHeader title="Workspace switcher" description="Organization-based data isolation is enforced on every server request." /><div className="mt-4 grid gap-3 md:grid-cols-2">{organizations.map((org: Organization) => <button key={org.id} className={`record-row w-full text-left ${activeWorkspace?.id === org.id ? 'border-navy-300 bg-navy-50' : ''}`} onClick={() => setActiveWorkspace(org.id)}><Building2 className="h-5 w-5 text-navy-600" /><div className="min-w-0 flex-1"><div className="font-semibold text-slate-800">{org.name}</div><div className="text-xs text-slate-400">{titleCase(org.type)} • {org.code} • {org.region}</div></div>{activeWorkspace?.id === org.id ? <Badge tone="green">Active</Badge> : <ChevronRight className="h-4 w-4 text-slate-400" />}</button>)}</div></Card>
      <Card className="p-5"><SectionHeader title="Letterhead & organization details" description="Used by manual document templates and PDF exports." /><form onSubmit={save} className="mt-4 space-y-4"><Field label="Letterhead"><Textarea rows={2} value={settings.letterheadName} onChange={(event) => setSettings({ ...settings, letterheadName: event.target.value })} disabled={!canEdit} /></Field><div className="form-grid"><Field label="Address"><Input value={settings.address} onChange={(event) => setSettings({ ...settings, address: event.target.value })} disabled={!canEdit} /></Field><Field label="Telephone"><Input value={settings.phone} onChange={(event) => setSettings({ ...settings, phone: event.target.value })} disabled={!canEdit} /></Field><Field label="Official email"><Input value={settings.email} onChange={(event) => setSettings({ ...settings, email: event.target.value })} disabled={!canEdit} /></Field><Field label="Region"><Input value={settings.region} onChange={(event) => setSettings({ ...settings, region: event.target.value })} disabled={!canEdit} /></Field></div><Field label="Motto"><Input value={settings.motto} onChange={(event) => setSettings({ ...settings, motto: event.target.value })} disabled={!canEdit} /></Field>{canEdit && <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>Save workspace settings</Button>}</form></Card>
    </div>
  );
}

function ActivitySettings() {
  const { data, loading, refetch } = useApiData<{ activity: AuditLog[] }>('/profile/activity');
  return (
    <Card className="p-5"><SectionHeader title="Account activity log" description="Sensitive actions recorded with IP address and user agent." action={<Button size="sm" variant="outline" icon={<RefreshCcw className="h-4 w-4" />} onClick={refetch}>Refresh</Button>} />{loading ? <Spinner label="Loading activity" /> : <div className="mt-4 space-y-2">{(data?.activity || []).length === 0 && <div className="text-sm text-slate-400">No activity recorded.</div>}{(data?.activity || []).map((log) => <div key={log.id} className="record-row"><Activity className="h-4 w-4 text-navy-600" /><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-700">{titleCase(log.action.replaceAll('.', ' '))}</div><div className="text-xs text-slate-400">{formatDateTime(log.created_at)} • {log.ip_address || 'IP not recorded'} • {truncate(log.user_agent, 60)}</div></div><Badge tone="muted">{titleCase(log.entity_type)}</Badge></div>)}</div>}</Card>
  );
}

function ProviderSettings() {
  const { data } = useApiData<{ providers: Array<{ channel: string; configured: boolean }> }>('/provider-status');
  return (
    <Card className="p-5"><SectionHeader title="Integration status" description="Only server-side environment variables are used. No credentials are exposed to the browser." /><div className="mt-4 grid gap-3 sm:grid-cols-2">{(data?.providers || []).map((provider) => <div key={provider.channel} className="record-row"><Wifi className="h-4 w-4 text-navy-600" /><div className="flex-1"><div className="text-sm font-semibold text-slate-700">{titleCase(provider.channel)}</div><div className="text-xs text-slate-400">{provider.configured ? 'Ready for delivery attempts' : 'Not configured'}</div></div><StatusBadge status={provider.configured ? 'configured' : 'not_configured'} /></div>)}</div><div className="mt-4"><Alert tone="info">See README.md and .env.example for exact provider configuration, cron setup and backup procedures.</Alert></div></Card>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('profile');
  if (!user) return <Spinner label="Loading settings" />;
  return (
    <div className="stack">
      <PageHeader eyebrow="Account & administration" title="Settings" description="Profile, security, notification preferences, sessions, workspace settings and integration status." />
      <Tabs active={tab} onChange={setTab} tabs={[{ id: 'profile', label: 'Profile' }, { id: 'security', label: 'Security' }, { id: 'preferences', label: 'Notifications' }, { id: 'sessions', label: 'Sessions' }, { id: 'workspace', label: 'Workspace' }, { id: 'activity', label: 'Activity' }, { id: 'integrations', label: 'Integrations' }]} />
      {tab === 'profile' && <ProfileSettings />}
      {tab === 'security' && <SecuritySettings />}
      {tab === 'preferences' && <PreferenceSettings />}
      {tab === 'sessions' && <SessionSettings />}
      {tab === 'workspace' && <WorkspaceSettings />}
      {tab === 'activity' && <ActivitySettings />}
      {tab === 'integrations' && <ProviderSettings />}
    </div>
  );
}

export function WorkspacesPage() {
  const { organizations, activeWorkspace, setActiveWorkspace } = useWorkspace();
  const { user } = useAuth();
  return (
    <div className="stack">
      <PageHeader eyebrow="School & zonal management" title="Workspaces" description="Each workspace isolates HELP requests, meetings, correspondence, tasks, documents and reports." actions={<LinkButton href="/workspace/settings" variant="outline" icon={<ShieldCheck className="h-4 w-4" />}>Workspace settings</LinkButton>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{organizations.map((org) => <Card key={org.id} className="p-5"><div className="flex items-start justify-between"><div><Badge tone={org.type === 'zonal' ? 'gold' : 'navy'}>{titleCase(org.type)} workspace</Badge><h3 className="mt-3 text-lg font-semibold text-navy-900">{org.name}</h3><div className="mt-1 text-xs text-slate-400">{org.code} • {org.region}</div></div><Building2 className="h-6 w-6 text-navy-600" /></div><div className="mt-4 space-y-2 text-sm text-slate-600"><div>{org.address || 'No address recorded'}</div><div>{org.phone || 'No telephone recorded'}</div><div>{org.email || 'No email recorded'}</div>{org.parent_id && <div className="text-xs text-gold-700">Participating school in a zonal workspace</div>}</div><div className="mt-5 flex items-center justify-between">{activeWorkspace?.id === org.id ? <Badge tone="green">Current workspace</Badge> : <Button size="sm" onClick={() => setActiveWorkspace(org.id)}>Switch here</Button>}{org.type === 'zonal' && user?.permissions.includes('view_reports') && <Link href="/workspace/reports" className="text-xs font-semibold text-navy-700 hover:underline">Consolidated view</Link>}</div></Card>)}</div>
    </div>
  );
}

const emptyUserForm = {
  name: '', email: '', role: 'executive' as Role, position: '', organization: '', phone: '', whatsappNumber: '',
  committee: '', responsibilities: '', organizationIds: [] as string[], isPrimarySecretary: false, canViewConsolidated: false,
  activateByLink: true, temporaryPassword: '',
};

function CreateUserModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { organizations } = useWorkspace();
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyUserForm);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ activationUrl: string | null; temporaryPassword: string | null; emailStatus: string; message: string } | null>(null);
  useEffect(() => { if (open) { setForm(emptyUserForm); setResult(null); } }, [open]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await apiPost<{ activationUrl: string | null; temporaryPassword: string | null; emailStatus: string; message: string }>('/admin/users', form);
      setResult(created);
      showToast({ title: 'Account created', description: created.message, tone: 'success' });
      onSaved();
    } catch (error) {
      showToast({ title: 'Account creation failed', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Create authorized account" description="Creates a local profile and, when configured, a remote authentication user." size="lg" footer={<><Button variant="outline" onClick={onClose}>{result ? 'Close' : 'Cancel'}</Button>{!result && <Button type="submit" form="create-user-form" loading={saving}>Create account</Button>}</>}>
      {result ? <div className="space-y-4"><Alert tone="success" title="Account created">{result.message}</Alert>{result.activationUrl && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="text-xs font-semibold text-emerald-900">Single-use activation link</div><div className="mt-1 break-all text-xs text-navy-700">{result.activationUrl}</div><Button size="sm" variant="outline" className="mt-2" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void navigator.clipboard?.writeText(result.activationUrl || '')}>Copy link</Button></div>}{result.temporaryPassword && <Alert tone="warning" title="Temporary password">Share this password securely: <strong>{result.temporaryPassword}</strong></Alert>}<div className="text-xs text-slate-500">Email status: {result.emailStatus}. Delivery is not claimed unless the provider confirms it.</div></div> : (
        <form id="create-user-form" onSubmit={submit} className="space-y-4">
          <div className="form-grid"><Field label="Full name" required><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field><Field label="Official email" required><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field><Field label="Role" required><Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>{roles.map((role) => <option key={role} value={role}>{titleCase(role)}</option>)}</Select></Field><Field label="Position" required><Input value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} required /></Field><Field label="Organization description" required><Input value={form.organization} onChange={(event) => setForm({ ...form, organization: event.target.value })} required /></Field><Field label="Registered telephone" required><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></Field><Field label="WhatsApp number"><Input value={form.whatsappNumber} onChange={(event) => setForm({ ...form, whatsappNumber: event.target.value })} /></Field><Field label="Committee"><Input value={form.committee} onChange={(event) => setForm({ ...form, committee: event.target.value })} /></Field></div>
          <Field label="Responsibilities"><Textarea rows={2} value={form.responsibilities} onChange={(event) => setForm({ ...form, responsibilities: event.target.value })} /></Field>
          <Field label="Workspace membership" required><div className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">{organizations.map((org) => <label key={org.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.organizationIds.includes(org.id)} onChange={(event) => setForm({ ...form, organizationIds: event.target.checked ? [...form.organizationIds, org.id] : form.organizationIds.filter((value) => value !== org.id) })} />{org.name}</label>)}</div></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Toggle checked={form.isPrimarySecretary} onChange={(checked) => setForm({ ...form, isPrimarySecretary: checked })} label="Designated Secretary" /><Toggle checked={form.canViewConsolidated} onChange={(checked) => setForm({ ...form, canViewConsolidated: checked })} label="Consolidated view access" /><Toggle checked={form.activateByLink} onChange={(checked) => setForm({ ...form, activateByLink: checked })} label="Activate by secure link" /></div>
          {!form.activateByLink && <Field label="Temporary password" required><Input type="password" minLength={10} value={form.temporaryPassword} onChange={(event) => setForm({ ...form, temporaryPassword: event.target.value })} required /></Field>}
        </form>
      )}
    </Modal>
  );
}

export function AdminPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState('users');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [actionResult, setActionResult] = useState<{ title: string; link: string | null; status: string } | null>(null);
  const { data: usersData, loading: usersLoading, refetch: refreshUsers } = useApiData<{ users: AdminUser[] }>('/admin/users');
  const { data: auditData, loading: auditLoading, refetch: refreshAudit } = useApiData<{ logs: AuditLog[] }>(tab === 'audit' ? '/admin/audit-logs' : null, { enabled: tab === 'audit' });
  const { data: deliveryData, loading: deliveryLoading, refetch: refreshDeliveries } = useApiData<{ deliveries: Array<DeliveryLog & { user_name?: string; notification_title?: string | null }>; providers: Array<{ channel: string; configured: boolean }> }>(tab === 'deliveries' ? '/admin/delivery-logs' : null, { enabled: tab === 'deliveries' });
  const { data: providerData } = useApiData<{ providers: Array<{ channel: string; configured: boolean }> }>('/admin/provider-status');
  const filteredUsers = (usersData?.users || []).filter((item) => !search || `${item.name} ${item.email} ${item.position}`.toLowerCase().includes(search.toLowerCase()));

  if (user?.role !== 'system_admin') return <NotFoundPage message="The administration console is available only to the System Administrator." />;

  const toggleActive = async (item: AdminUser) => {
    try {
      await apiPatch(`/admin/users/${item.id}`, { isActive: !item.is_active });
      showToast({ title: item.is_active ? 'Account deactivated' : 'Account activated', tone: 'success' });
      await refreshUsers();
    } catch (error) {
      showToast({ title: 'Account update failed', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    }
  };
  const createLink = async (item: AdminUser, kind: 'reset' | 'activation') => {
    try {
      const result = await apiPost<{ resetUrl: string | null; emailStatus: string; message: string }>(`/admin/users/${item.id}/${kind === 'reset' ? 'reset' : 'activation'}`);
      setActionResult({ title: `${kind === 'reset' ? 'Password reset' : 'Activation'} link for ${item.name}`, link: result.resetUrl, status: result.emailStatus });
      showToast({ title: result.message, tone: result.resetUrl || result.emailStatus === 'sent' ? 'success' : 'warning' });
    } catch (error) {
      showToast({ title: 'Link could not be created', description: error instanceof Error ? error.message : undefined, tone: 'error' });
    }
  };

  return (
    <div className="stack">
      <PageHeader eyebrow="System administration" title="Admin console" description="Accounts, organization membership, audit logs, delivery logs and provider status." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Create account</Button>} />
      <Tabs active={tab} onChange={setTab} tabs={[{ id: 'users', label: 'Users', count: usersData?.users.length }, { id: 'audit', label: 'Audit logs' }, { id: 'deliveries', label: 'Delivery logs' }, { id: 'providers', label: 'Providers' }]} />
      {tab === 'users' && <div className="space-y-4"><Card className="p-4"><SearchInput value={search} onChange={setSearch} placeholder="Search name, email or position" /></Card>{usersLoading ? <Spinner label="Loading accounts" /> : <Card className="overflow-hidden"><TableWrap className="rounded-none border-0"><table className="data-table"><thead><tr><th>Account</th><th>Role</th><th>Workspaces</th><th>Sessions</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredUsers.map((item) => <tr key={item.id}><td><div className="flex items-center gap-3"><Avatar name={item.name} color={item.avatar_color} size="sm" /><div><div className="font-semibold text-slate-800">{item.name}</div><div className="text-xs text-slate-400">{item.email}</div></div></div></td><td>{titleCase(item.role)}</td><td>{item.organization_ids.length}</td><td>{item.session_count}</td><td><StatusBadge status={item.is_active ? 'active' : 'inactive'} /></td><td><div className="row-actions"><Button size="sm" variant="outline" onClick={() => void toggleActive(item)}>{item.is_active ? 'Deactivate' : 'Activate'}</Button><Button size="sm" variant="ghost" onClick={() => void createLink(item, 'reset')}>Reset link</Button><Button size="sm" variant="ghost" onClick={() => void createLink(item, 'activation')}>Activation link</Button></div></td></tr>)}</tbody></table></TableWrap></Card>}</div>}
      {tab === 'audit' && (auditLoading ? <Spinner label="Loading audit logs" /> : <Card className="overflow-hidden"><TableWrap className="rounded-none border-0"><table className="data-table"><thead><tr><th>Action</th><th>Actor</th><th>Entity</th><th>IP</th><th>Time</th></tr></thead><tbody>{(auditData?.logs || []).map((log) => <tr key={log.id}><td>{titleCase(log.action.replaceAll('.', ' '))}</td><td>{log.actor_name || 'System'}</td><td>{titleCase(log.entity_type)}</td><td>{log.ip_address || '—'}</td><td>{formatDateTime(log.created_at)}</td></tr>)}</tbody></table></TableWrap></Card>)}
      {tab === 'deliveries' && (deliveryLoading ? <Spinner label="Loading delivery logs" /> : <Card className="overflow-hidden"><TableWrap className="rounded-none border-0"><table className="data-table"><thead><tr><th>Recipient</th><th>Channel</th><th>Status</th><th>Attempts</th><th>Result</th><th>Time</th></tr></thead><tbody>{(deliveryData?.deliveries || []).map((log) => <tr key={log.id}><td>{log.user_name || log.user_id}</td><td>{titleCase(log.channel)}</td><td><StatusBadge status={log.status} /></td><td>{log.attempts}</td><td className="max-w-xs truncate">{log.last_error || log.provider_message_id || '—'}</td><td>{formatDateTime(log.created_at)}</td></tr>)}</tbody></table></TableWrap></Card>)}
      {tab === 'providers' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(providerData?.providers || []).map((provider) => <Card key={provider.channel} className="p-5"><div className="flex items-center justify-between"><div><div className="text-sm font-semibold text-navy-900">{titleCase(provider.channel)}</div><div className="text-xs text-slate-500">Server-side credentials only</div></div><Badge tone={provider.configured ? 'green' : 'muted'}>{provider.configured ? 'Configured' : 'Not configured'}</Badge></div></Card>)}<Card className="p-5"><SectionHeader title="Cron & escalation" description={`Urgent requests escalate after the configured period. The current server value is documented in .env.example.`} /><LinkButton href="/workspace/notifications" variant="outline" size="sm" className="mt-4">Open notification centre</LinkButton></Card></div>}
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => { void refreshUsers(); }} />
      <Modal open={Boolean(actionResult)} onClose={() => setActionResult(null)} title={actionResult?.title || 'Secure link'} description="Single-use link prepared by the server." footer={<Button variant="outline" onClick={() => setActionResult(null)}>Close</Button>}>
        {actionResult?.link ? <div className="space-y-3"><Alert tone="success">Local development link. Share it securely with the account owner.</Alert><div className="break-all rounded-xl bg-slate-50 p-3 text-xs text-navy-800">{actionResult.link}</div><Button size="sm" variant="outline" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void navigator.clipboard?.writeText(actionResult.link || '')}>Copy link</Button></div> : <Alert tone={actionResult?.status === 'sent' ? 'success' : 'warning'}>{actionResult?.status === 'sent' ? 'The provider confirmed the email request. Check the delivery log for the provider message id.' : 'Email delivery is not configured or did not succeed. Use the delivery log to verify; no successful delivery is claimed.'}</Alert>}
      </Modal>
    </div>
  );
}

export function NotFoundPage({ message }: { message?: string }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <Card className="p-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-50 text-navy-800"><Shield className="h-7 w-7" /></div><h1 className="mt-5 text-2xl font-bold text-navy-900">Page not available</h1><p className="mt-2 text-sm text-slate-500">{message || 'The page you requested does not exist or is not available for your role.'}</p><LinkButton href="/workspace/dashboard" className="mt-6" icon={<ChevronRight className="h-4 w-4" />}>Return to dashboard</LinkButton></Card>
    </div>
  );
}
