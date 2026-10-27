'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useAuth, useWorkspace } from '@/components/providers';
import { Alert, Button, Spinner } from '@/components/ui';
import { AppShell } from './AppShell';
import { DashboardPage } from '@/components/pages/DashboardPage';
import { HelpPage } from '@/components/pages/HelpPage';
import { MeetingDetailPage, MeetingsPage } from '@/components/pages/MeetingPages';
import { ApprovalsPage, DocumentEditorPage, DocumentsPage, TemplatesPage } from '@/components/pages/DocumentPages';
import { DocumentSubmissionsPage } from '@/components/pages/DocumentSubmissionPages';
import { CalendarPage, CorrespondencePage, TasksPage } from '@/components/pages/OperationsPages';
import { BriefingsPage, ReportsPage } from '@/components/pages/InsightsPages';
import { CommunicationPage, DirectoryPage, NotificationsPage } from '@/components/pages/CommunicationPages';
import { AdminPage, NotFoundPage, SettingsPage, WorkspacesPage } from '@/components/pages/SettingsPages';

function AccessDenied() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <Alert tone="warning" title="No workspace membership"><div className="mt-1 flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Your account is active but has no organization assignment. Contact the System Administrator.</div></Alert>
      <div className="mt-5 text-center"><Button variant="outline" onClick={() => window.location.reload()}>Refresh membership</Button></div>
    </div>
  );
}

export function WorkspaceRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { organizations, loading: workspaceLoading } = useWorkspace();
  const segments = pathname.replace(/^\/workspace\/?/, '').split('/').filter(Boolean);
  const section = segments[0] || 'dashboard';
  const param = segments[1];

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || (user && workspaceLoading)) return <div className="flex min-h-screen items-center justify-center"><Spinner label="Loading your secure workspace" /></div>;
  if (!user) return <div className="flex min-h-screen items-center justify-center"><Spinner label="Redirecting to sign in" /></div>;
  if (organizations.length === 0 && section !== 'settings') return <AppShell><AccessDenied /></AppShell>;

  let content: React.ReactNode;
  switch (section) {
    case 'dashboard':
      content = <DashboardPage />;
      break;
    case 'help':
      content = <HelpPage id={param} />;
      break;
    case 'meetings':
      content = param ? <MeetingDetailPage id={param} /> : <MeetingsPage />;
      break;
    case 'documents':
      content = param === 'new' ? <DocumentEditorPage /> : param ? <DocumentEditorPage id={param} /> : <DocumentsPage />;
      break;
    case 'submissions':
      content = <DocumentSubmissionsPage />;
      break;
    case 'approvals':
      content = <ApprovalsPage />;
      break;
    case 'templates':
      content = <TemplatesPage />;
      break;
    case 'tasks':
      content = <TasksPage />;
      break;
    case 'correspondence':
      content = <CorrespondencePage />;
      break;
    case 'calendar':
      content = <CalendarPage />;
      break;
    case 'reports':
      content = <ReportsPage id={param} />;
      break;
    case 'briefings':
      content = <BriefingsPage id={param} />;
      break;
    case 'communication':
      content = <CommunicationPage />;
      break;
    case 'directory':
      content = <DirectoryPage />;
      break;
    case 'notifications':
      content = <NotificationsPage />;
      break;
    case 'workspaces':
      content = <WorkspacesPage />;
      break;
    case 'settings':
      content = <SettingsPage />;
      break;
    case 'admin':
      content = user.role === 'system_admin' ? <AdminPage /> : <NotFoundPage message="The administration console is available only to the System Administrator." />;
      break;
    default:
      content = <NotFoundPage />;
  }

  return <AppShell>{content}</AppShell>;
}
