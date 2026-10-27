'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FileText,
  FileUp,
  FolderOpen,
  Gauge,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Shield,
  Siren,
  Stamp,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { classNames, relativeTime, titleCase } from '@/lib/format';
import { useAuth, useRealtime, useWorkspace } from '@/components/providers';
import type { SearchResult } from '@/lib/shared-types';
import { BRAND } from '@/lib/brand';
import { Avatar, Badge, Button, IconButton, Spinner } from '@/components/ui';
import { HelpQuickModal } from './HelpQuickModal';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  group: string;
  permission?: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/workspace/dashboard', icon: <LayoutDashboard className="h-4 w-4" />, group: 'Overview' },
  { label: 'HELP requests', href: '/workspace/help', icon: <Siren className="h-4 w-4" />, group: 'Overview' },
  { label: 'Approvals', href: '/workspace/approvals', icon: <Stamp className="h-4 w-4" />, group: 'Overview', permission: 'review_documents' },
  { label: 'Meetings', href: '/workspace/meetings', icon: <Users className="h-4 w-4" />, group: 'Operations' },
  { label: 'Tasks & decisions', href: '/workspace/tasks', icon: <ClipboardCheck className="h-4 w-4" />, group: 'Operations' },
  { label: 'Correspondence', href: '/workspace/correspondence', icon: <Mail className="h-4 w-4" />, group: 'Operations' },
  { label: 'Calendar', href: '/workspace/calendar', icon: <CalendarDays className="h-4 w-4" />, group: 'Operations' },
  { label: 'Documents', href: '/workspace/documents', icon: <FolderOpen className="h-4 w-4" />, group: 'Records' },
  { label: 'Document inbox', href: '/workspace/submissions', icon: <FileUp className="h-4 w-4" />, group: 'Records' },
  { label: 'Templates', href: '/workspace/templates', icon: <BookOpen className="h-4 w-4" />, group: 'Records', permission: 'manage_templates' },
  { label: 'Reports', href: '/workspace/reports', icon: <FileText className="h-4 w-4" />, group: 'Insights', permission: 'view_reports' },
  { label: 'Briefing packs', href: '/workspace/briefings', icon: <Gauge className="h-4 w-4" />, group: 'Insights', permission: 'view_briefings' },
  { label: 'Communication', href: '/workspace/communication', icon: <MessageSquareText className="h-4 w-4" />, group: 'Workspace' },
  { label: 'Directory', href: '/workspace/directory', icon: <Users className="h-4 w-4" />, group: 'Workspace' },
  { label: 'Notifications', href: '/workspace/notifications', icon: <Bell className="h-4 w-4" />, group: 'Workspace' },
  { label: 'Workspaces', href: '/workspace/workspaces', icon: <Shield className="h-4 w-4" />, group: 'Workspace' },
  { label: 'Settings', href: '/workspace/settings', icon: <Settings className="h-4 w-4" />, group: 'Account' },
  { label: 'Admin console', href: '/workspace/admin', icon: <Shield className="h-4 w-4" />, group: 'Account', adminOnly: true },
];

function NavContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const items = useMemo(
    () => navItems.filter((item) => {
      if (item.adminOnly) return user?.role === 'system_admin';
      if (item.permission) return Boolean(user?.permissions.includes(item.permission) || user?.role === 'system_admin');
      return true;
    }),
    [user],
  );
  const groups = Array.from(new Set(items.map((item) => item.group)));
  return (
    <div className="flex h-full flex-col">
      <div className={classNames('flex h-16 items-center border-b border-white/10 px-4', collapsed && 'justify-center px-2')}>
        <Link href="/workspace/dashboard" className="flex items-center gap-3" onClick={onNavigate}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-400 text-[11px] font-bold text-navy-950">{BRAND.monogram}</div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{BRAND.name}</div>
              <div className="truncate text-[10px] text-slate-400">{BRAND.subtitle}</div>
            </div>
          )}
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group}>
            {!collapsed && <div className="sidebar-label">{group}</div>}
            {collapsed && <div className="my-3 border-t border-white/10" />}
            <div className="space-y-1">
              {items.filter((item) => item.group === group).map((item) => {
                const active = pathname === item.href || (item.href !== '/workspace/dashboard' && pathname.startsWith(`${item.href}/`));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={classNames('nav-item', active && 'nav-item-active', collapsed && 'justify-center px-2')}
                    onClick={onNavigate}
                  >
                    {item.icon}
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className={classNames('border-t border-white/10 p-3', collapsed && 'text-center')}>
        {!collapsed && activeWorkspace && (
          <div className="rounded-xl bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Current workspace</div>
            <div className="mt-1 truncate text-xs font-semibold text-white">{activeWorkspace.name}</div>
            <div className="mt-0.5 text-[10px] text-gold-300">{titleCase(activeWorkspace.type)} workspace</div>
          </div>
        )}
      </div>
    </div>
  );
}

function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      apiGet<{ results: SearchResult[] }>('/search', { q: query.trim() })
        .then((data) => { if (!cancelled) setResults(data.results); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  return (
    <div className="relative hidden w-full max-w-md md:block">
      <div className="search-input h-10">
        <Search className="h-4 w-4 text-slate-400" />
        <input value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search HELP, meetings, documents..." aria-label="Search records" />
        {query && <button onClick={() => { setQuery(''); setResults([]); }} aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
      </div>
      {open && query.trim().length >= 2 && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-label="Close search results" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-12 z-20 max-h-96 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
            {loading && <div className="px-3 py-4 text-xs text-slate-400">Searching saved records…</div>}
            {!loading && results.length === 0 && <div className="px-3 py-4 text-xs text-slate-400">No matching records in this workspace.</div>}
            {!loading && results.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
                onClick={() => { setOpen(false); setQuery(''); router.push(result.link); }}
              >
                <div className="mt-0.5 rounded-lg bg-navy-50 px-2 py-1 text-[10px] font-semibold text-navy-700">{result.badge || titleCase(result.type)}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">{result.title}</div>
                  <div className="truncate text-xs text-slate-400">{result.subtitle}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NotificationMenu() {
  const { notifications, unreadCount, markRead, markAllRead } = useRealtime();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <IconButton label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`} className="relative" onClick={() => setOpen((value) => !value)}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[9px] font-bold leading-4 text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </IconButton>
      {open && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" aria-label="Close notifications" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-20 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="text-sm font-semibold text-navy-900">Notifications</div>
              <button className="text-xs font-semibold text-navy-700 hover:underline" onClick={() => void markAllRead()}>Mark all read</button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-400">You are all caught up.</div>}
              {notifications.slice(0, 8).map((notification) => (
                <div key={notification.id} className={classNames('border-b border-slate-100 px-4 py-3', !notification.is_read && 'bg-navy-50/40')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800">{notification.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{notification.body}</div>
                      <div className="mt-1 text-[10px] text-slate-400">{relativeTime(notification.created_at)}</div>
                    </div>
                    {!notification.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                  </div>
                  <div className="mt-2 flex gap-3 text-[11px] font-semibold">
                    {notification.link && <Link href={notification.link} className="text-navy-700 hover:underline" onClick={() => setOpen(false)}>Open</Link>}
                    {!notification.is_read && <button className="text-slate-500 hover:underline" onClick={() => void markRead(notification.id)}>Mark read</button>}
                  </div>
                </div>
              ))}
            </div>
            <Link href="/workspace/notifications" className="block border-t border-slate-100 px-4 py-3 text-center text-xs font-semibold text-navy-700 hover:bg-slate-50" onClick={() => setOpen(false)}>View all notifications</Link>
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { organizations, activeWorkspace, setActiveWorkspace } = useWorkspace();
  const realtime = useRealtime();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const openHelp = () => setHelpOpen(true);
    window.addEventListener('srcpro:open-help', openHelp);
    return () => window.removeEventListener('srcpro:open-help', openHelp);
  }, []);

  if (!user) return <div className="flex min-h-screen items-center justify-center"><Spinner label="Preparing your workspace" /></div>;

  const canCreateHelp = user.permissions.includes('create_help') || user.role === 'system_admin';

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    router.replace('/login');
  };

  return (
    <div className="app-shell">
      <aside className={classNames('app-sidebar', collapsed && 'app-sidebar-collapsed', mobileOpen && 'app-sidebar-mobile-open')}>
        <NavContent collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
      </aside>
      {mobileOpen && <button className="fixed inset-0 z-40 bg-navy-950/50 lg:hidden" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <div className={classNames('app-main', collapsed && 'app-main-collapsed')}>
        <header className="topbar no-print">
          <IconButton label="Open navigation" className="lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></IconButton>
          <IconButton label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hidden lg:inline-flex" onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </IconButton>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500 xl:flex">
              {realtime.connected ? <Wifi className="h-3 w-3 text-emerald-600" /> : <WifiOff className="h-3 w-3 text-gold-600" />}
              {realtime.connected ? 'Live' : realtime.mode === 'polling' ? 'Polling' : 'Connecting'}
            </div>
            <div className="relative hidden sm:block">
              <select
                aria-label="Switch workspace"
                className="input h-10 max-w-[210px] py-0 text-xs font-semibold"
                value={activeWorkspace?.id || ''}
                onChange={(event) => setActiveWorkspace(event.target.value)}
              >
                {organizations.map((org) => <option key={org.id} value={org.id}>{org.name} • {titleCase(org.type)}</option>)}
              </select>
            </div>
            {canCreateHelp ? (
              <Button variant="danger" size="sm" className="hidden sm:inline-flex" icon={<Siren className="h-4 w-4" />} onClick={() => setHelpOpen(true)}>HELP! I NEED MY SECRETARY</Button>
            ) : (
              <Link href="/workspace/help" className="btn bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"><Inbox className="h-4 w-4" /> HELP inbox</Link>
            )}
            <Link href="/workspace/communication" className="icon-btn relative" aria-label={`Messages${realtime.unreadMessages ? ` (${realtime.unreadMessages} unread)` : ''}`}>
              <MessageSquareText className="h-5 w-5" />
              {realtime.unreadMessages > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-gold-500 px-1 text-center text-[9px] font-bold leading-4 text-navy-950">{realtime.unreadMessages > 9 ? '9+' : realtime.unreadMessages}</span>}
            </Link>
            <NotificationMenu />
            <div className="relative">
              <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 hover:bg-slate-50" onClick={() => setUserMenuOpen((value) => !value)} aria-label="Account menu">
                <Avatar name={user.name} color={user.avatar_color} size="sm" />
                <div className="hidden text-left xl:block">
                  <div className="max-w-32 truncate text-xs font-semibold text-slate-800">{user.name}</div>
                  <div className="text-[10px] text-slate-400">{titleCase(user.role)}</div>
                </div>
                <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 xl:block" />
              </button>
              {userMenuOpen && (
                <>
                  <button className="fixed inset-0 z-10 cursor-default" aria-label="Close account menu" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-12 z-20 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                    <div className="border-b border-slate-100 px-3 py-2">
                      <div className="text-sm font-semibold text-slate-800">{user.name}</div>
                      <div className="truncate text-xs text-slate-400">{user.email}</div>
                    </div>
                    <Link href="/workspace/settings" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><Settings className="h-4 w-4" /> Account settings</Link>
                    <Link href="/workspace/notifications" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><Bell className="h-4 w-4" /> Notification centre</Link>
                    <button onClick={() => void handleLogout()} disabled={loggingOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" /> {loggingOut ? 'Signing out…' : 'Sign out'}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>

      <nav className="mobile-nav no-print" aria-label="Mobile navigation">
        <Link href="/workspace/dashboard" className={classNames('mobile-nav-item', pathname.startsWith('/workspace/dashboard') && 'mobile-nav-item-active')}><LayoutDashboard className="h-5 w-5" /> Home</Link>
        <Link href="/workspace/help" className={classNames('mobile-nav-item', pathname.startsWith('/workspace/help') && 'mobile-nav-item-active')}><Siren className="h-5 w-5" /> HELP</Link>
        <button onClick={() => setHelpOpen(true)} className="mobile-nav-item text-red-600"><HelpCircle className="h-5 w-5" /> Urgent</button>
        <Link href="/workspace/tasks" className={classNames('mobile-nav-item', pathname.startsWith('/workspace/tasks') && 'mobile-nav-item-active')}><ClipboardCheck className="h-5 w-5" /> Tasks</Link>
        <button onClick={() => setMobileOpen(true)} className="mobile-nav-item"><Menu className="h-5 w-5" /> More</button>
      </nav>

      {canCreateHelp && (
        <button className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-2xl sm:hidden" aria-label="Open urgent HELP form" onClick={() => setHelpOpen(true)}>
          <Siren className="h-6 w-6" />
        </button>
      )}

      <HelpQuickModal open={helpOpen && canCreateHelp} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
