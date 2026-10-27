'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FilePlus2,
  FileText,
  FileUp,
  FolderOpen,
  Mail,
  Megaphone,
  PenLine,
  Siren,
  Stamp,
  Users,
} from 'lucide-react';
import type { DashboardData } from '@/lib/shared-types';
import { useApiData } from '@/lib/hooks';
import { useAuth, useWorkspace } from '@/components/providers';
import { openHelpModal } from '@/lib/events';
import { formatDate, formatDateTime, relativeTime, statusTone, titleCase, truncate } from '@/lib/format';
import { Alert, Badge, Button, Card, EmptyState, LinkButton, PageHeader, PriorityBadge, SectionHeader, Spinner, StatCard, StatusBadge } from '@/components/ui';
import { AttendanceSignInPanel } from './AttendanceSignInPanel';

const statIcons = {
  approvals: <Stamp className="h-5 w-5" />,
  help: <Siren className="h-5 w-5" />,
  tasks: <ClipboardCheck className="h-5 w-5" />,
  meetings: <CalendarDays className="h-5 w-5" />,
};

function QuickAction({ href, icon, label, onClick }: { href?: string; icon: React.ReactNode; label: string; onClick?: () => void }) {
  const className = 'flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left text-sm font-semibold text-slate-700 transition hover:border-navy-300 hover:bg-navy-50 hover:text-navy-900';
  const content = <>{icon}<span>{label}</span><ArrowRight className="ml-auto h-4 w-4 opacity-50" /></>;
  return href ? <Link href={href} className={className}>{content}</Link> : <button type="button" className={`${className} w-full`} onClick={onClick}>{content}</button>;
}

function ListCard({ title, action, children }: { title: string; action?: { label: string; href: string }; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
        {action && <Link href={action.href} className="text-xs font-semibold text-navy-700 hover:underline">{action.label}</Link>}
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </Card>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { data, loading, error, refetch } = useApiData<DashboardData>('/dashboard');
  const isPresident = user?.role.includes('president');
  const isSecretary = user?.role.includes('secretary') || user?.role === 'system_admin';
  const canCreateHelp = Boolean(user?.permissions.includes('create_help') || user?.role === 'system_admin');
  const showAttendance = Boolean(isPresident || isSecretary);
  const scrollToAttendance = () => document.getElementById('attendance-sign-in')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (loading) return <Spinner label="Loading dashboard records" />;
  if (error) return <Alert tone="error" action={<Button size="sm" variant="outline" onClick={refetch}>Retry</Button>}>{error}</Alert>;
  if (!data) return <EmptyState title="No dashboard records" description="Create a meeting, task or HELP request to begin." />;

  return (
    <div className="stack">
      <PageHeader
        eyebrow={titleCase(user?.role || '')}
        title={`Welcome, ${data.greeting_name}`}
        description={`${activeWorkspace?.name || data.organization.name} • ${formatDate(data.current_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <>
            <Badge tone={data.organization.type === 'zonal' ? 'gold' : 'navy'}>{titleCase(data.organization.type)} workspace</Badge>
            {canCreateHelp && <Button variant="danger" icon={<Siren className="h-4 w-4" />} onClick={openHelpModal}>HELP! I NEED MY SECRETARY</Button>}
          </>
        }
      />

      {isPresident && (
        <Card className="overflow-hidden border-red-200 bg-gradient-to-r from-red-600 to-red-500 p-0 text-white">
          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-red-100">Presidential priority</div>
              <h2 className="mt-2 text-2xl font-bold">Need immediate secretarial support?</h2>
              <p className="mt-1 max-w-2xl text-sm text-red-50">Submit a verified HELP request with your location and priority. It is routed to the designated Secretary with a full status history.</p>
            </div>
            <Button size="lg" className="bg-white text-red-700 hover:bg-red-50" icon={<Siren className="h-5 w-5" />} onClick={openHelpModal}>Request Secretary Assistance</Button>
          </div>
        </Card>
      )}

      <div className="grid-stats">
        {data.stats.map((stat) => (
          <StatCard key={stat.key} label={stat.label} value={stat.value} hint={stat.hint} tone={stat.tone} icon={statIcons[stat.key as keyof typeof statIcons] || <CheckCircle2 className="h-5 w-5" />} />
        ))}
      </div>

      <Card className="p-5">
        <SectionHeader title="Quick actions" description="Every shortcut opens a working form or filtered record list." />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {isPresident ? (
            <>
              <QuickAction icon={<Siren className="h-4 w-4 text-red-600" />} label="Request Secretary Assistance" onClick={openHelpModal} />
              <QuickAction href="/workspace/meetings?request=1" icon={<CalendarDays className="h-4 w-4" />} label="Create Meeting Request" />
              <QuickAction href="/workspace/approvals" icon={<Stamp className="h-4 w-4" />} label="Review Documents" />
              <QuickAction href="/workspace/tasks" icon={<ClipboardCheck className="h-4 w-4" />} label="View My Tasks" />
              <QuickAction href="/workspace/calendar" icon={<CalendarDays className="h-4 w-4" />} label="Open Calendar" />
              <QuickAction href="/workspace/communication?compose=1" icon={<Mail className="h-4 w-4" />} label="Contact Secretary" />
              <QuickAction href="/workspace/briefings" icon={<FileText className="h-4 w-4" />} label="Briefing Packs" />
              <QuickAction href="/workspace/reports" icon={<FolderOpen className="h-4 w-4" />} label="Verified Reports" />
              <QuickAction icon={<Users className="h-4 w-4" />} label="Monitor Attendance" onClick={scrollToAttendance} />
              <QuickAction href="/workspace/submissions" icon={<FileUp className="h-4 w-4" />} label="Document Inbox" />
            </>
          ) : isSecretary ? (
            <>
              <QuickAction href="/workspace/meetings?create=1" icon={<CalendarDays className="h-4 w-4" />} label="Create Meeting" />
              <QuickAction href="/workspace/meetings" icon={<PenLine className="h-4 w-4" />} label="Record Minutes" />
              <QuickAction href="/workspace/documents/new" icon={<FilePlus2 className="h-4 w-4" />} label="Draft Letter" />
              <QuickAction href="/workspace/tasks?create=1" icon={<ClipboardCheck className="h-4 w-4" />} label="Add Task" />
              <QuickAction href="/workspace/help" icon={<Siren className="h-4 w-4 text-red-600" />} label="Open HELP Inbox" />
              <QuickAction href="/workspace/reports?create=1" icon={<FileText className="h-4 w-4" />} label="Create Report" />
              <QuickAction href="/workspace/calendar" icon={<CalendarDays className="h-4 w-4" />} label="View Calendar" />
              <QuickAction href="/workspace/documents/new" icon={<FolderOpen className="h-4 w-4" />} label="Add Document" />
              <QuickAction icon={<Users className="h-4 w-4" />} label="Attendance Sign-In" onClick={scrollToAttendance} />
              <QuickAction href="/workspace/submissions" icon={<FileUp className="h-4 w-4" />} label="Upload / Submit File" />
            </>
          ) : (
            <>
              <QuickAction href="/workspace/tasks" icon={<ClipboardCheck className="h-4 w-4" />} label="My Tasks" />
              <QuickAction href="/workspace/meetings" icon={<Users className="h-4 w-4" />} label="Meetings" />
              <QuickAction href="/workspace/calendar" icon={<CalendarDays className="h-4 w-4" />} label="Calendar" />
              <QuickAction href="/workspace/communication" icon={<Mail className="h-4 w-4" />} label="Communication" />
              <QuickAction href="/workspace/submissions" icon={<FileUp className="h-4 w-4" />} label="Document Inbox" />
            </>
          )}
        </div>
      </Card>

      {showAttendance && <AttendanceSignInPanel canManage={isSecretary} />}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <ListCard title={isPresident ? 'Recent HELP requests' : 'Urgent HELP inbox'} action={{ label: 'Open inbox', href: '/workspace/help' }}>
            {data.help_requests.length === 0 && <div className="px-5 py-6 text-sm text-slate-400">No HELP requests in this workspace.</div>}
            {data.help_requests.slice(0, 5).map((request) => (
              <Link key={request.id} href={`/workspace/help/${request.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50">
                <div className={`h-9 w-1 rounded-full ${request.status === 'new' ? 'bg-red-500' : request.status === 'resolved' ? 'bg-emerald-500' : 'bg-gold-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-800">{request.subject}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{request.reference} • {request.requester_name} • {relativeTime(request.submitted_at)}</div>
                </div>
                <PriorityBadge priority={request.priority} />
                <StatusBadge status={request.status} />
              </Link>
            ))}
          </ListCard>

          <div className="grid gap-4 md:grid-cols-2">
            <ListCard title="Upcoming meetings & programmes" action={{ label: 'Calendar', href: '/workspace/calendar' }}>
              {data.meetings.length === 0 && <div className="px-5 py-6 text-sm text-slate-400">No upcoming meetings.</div>}
              {data.meetings.slice(0, 4).map((meeting) => (
                <Link key={meeting.id} href={`/workspace/meetings/${meeting.id}`} className="block px-5 py-3 hover:bg-slate-50">
                  <div className="truncate text-sm font-semibold text-slate-800">{meeting.title}</div>
                  <div className="mt-1 text-xs text-slate-400">{formatDateTime(meeting.starts_at)} • {meeting.venue}</div>
                </Link>
              ))}
            </ListCard>
            <ListCard title="Outstanding tasks" action={{ label: 'All tasks', href: '/workspace/tasks' }}>
              {data.tasks.length === 0 && <div className="px-5 py-6 text-sm text-slate-400">No outstanding tasks.</div>}
              {data.tasks.slice(0, 4).map((task) => (
                <Link key={task.id} href="/workspace/tasks" className="block px-5 py-3 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-slate-800">{task.title}</div>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{task.assignee_name} • due {formatDate(task.due_date)}</div>
                </Link>
              ))}
            </ListCard>
          </div>

          <ListCard title="Documents requiring attention" action={{ label: 'Approvals', href: '/workspace/approvals' }}>
            {data.approvals.length === 0 && <div className="px-5 py-6 text-sm text-slate-400">No documents are awaiting approval.</div>}
            {data.approvals.slice(0, 5).map((document) => (
              <Link key={document.id} href={`/workspace/documents/${document.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <FileText className="h-4 w-4 text-navy-600" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-800">{document.title}</div>
                  <div className="text-xs text-slate-400">{document.reference} • by {document.author_name}</div>
                </div>
                <StatusBadge status={document.status} />
              </Link>
            ))}
          </ListCard>
        </div>

        <div className="space-y-4">
          <ListCard title="Important deadlines" action={{ label: 'Tasks', href: '/workspace/tasks' }}>
            {data.deadlines.length === 0 && <div className="px-5 py-6 text-sm text-slate-400">No upcoming deadlines.</div>}
            {data.deadlines.slice(0, 6).map((deadline) => (
              <Link key={`${deadline.type}-${deadline.id}`} href={deadline.link} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <Clock3 className="h-4 w-4 text-gold-600" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-700">{deadline.label}</div>
                  <div className="text-xs text-slate-400">{formatDateTime(deadline.due_date)} • {titleCase(deadline.type)}</div>
                </div>
              </Link>
            ))}
          </ListCard>

          <ListCard title="Executive announcements" action={{ label: 'Communication', href: '/workspace/communication' }}>
            {data.announcements.length === 0 && <div className="px-5 py-6 text-sm text-slate-400">No announcements yet.</div>}
            {data.announcements.slice(0, 5).map((announcement) => (
              <div key={announcement.id} className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-3.5 w-3.5 text-gold-600" />
                  <div className="truncate text-sm font-semibold text-slate-800">{announcement.title}</div>
                </div>
                <p className="mt-1 text-xs text-slate-500">{truncate(announcement.body, 110)}</p>
                <div className="mt-1 text-[10px] text-slate-400">{announcement.author_name} • {relativeTime(announcement.created_at)}</div>
              </div>
            ))}
          </ListCard>

          <ListCard title="Recent notifications" action={{ label: 'View all', href: '/workspace/notifications' }}>
            {data.notifications.length === 0 && <div className="px-5 py-6 text-sm text-slate-400">No notifications yet.</div>}
            {data.notifications.slice(0, 5).map((notification) => (
              <div key={notification.id} className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-3.5 w-3.5 text-navy-600" />
                  <div className="truncate text-sm font-semibold text-slate-800">{notification.title}</div>
                  {!notification.is_read && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                </div>
                <p className="mt-1 text-xs text-slate-500">{truncate(notification.body, 100)}</p>
              </div>
            ))}
          </ListCard>

          <Card className="p-5">
            <SectionHeader title="Workspace activity" description="Recent audited actions." />
            <div className="mt-4 space-y-3">
              {data.recent_activity.length === 0 && <div className="text-sm text-slate-400">No activity recorded.</div>}
              {data.recent_activity.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 text-xs">
                  <div className="mt-1 h-2 w-2 rounded-full bg-navy-400" />
                  <div>
                    <div className="font-medium text-slate-700">{titleCase(activity.action.replaceAll('.', ' '))}</div>
                    <div className="text-slate-400">{activity.actor_name || 'System'} • {relativeTime(activity.created_at)}</div>
                  </div>
                </div>
              ))}
              <LinkButton href="/workspace/notifications" variant="outline" size="sm" fullWidth icon={<ArrowRight className="h-4 w-4" />}>Open notification centre</LinkButton>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
