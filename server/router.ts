import { authenticate, requireCsrf } from './auth';
import type { ApiContext } from './context';
import type { AuthContext } from './permissions';
import { getRuntime } from './runtime';
import { apiError, json } from './utils';

import {
  activityRoute,
  changePasswordRoute,
  forgotPasswordRoute,
  loginRoute,
  logoutAllRoute,
  logoutRoute,
  meRoute,
  organizationSettingsRoute,
  organizationsRoute,
  pushPublicKeyRoute,
  pushSubscribeRoute,
  pushUnsubscribeRoute,
  resetPasswordRoute,
  revokeSessionRoute,
  sessionsRoute,
  updateOrganizationSettingsRoute,
  updatePreferencesRoute,
  updateProfileRoute,
  getPreferencesRoute,
} from './routes/auth-routes';
import { dashboardRoute } from './routes/dashboard';
import {
  acknowledgeHelpRoute,
  addHelpUpdateRoute,
  createHelpRequestRoute,
  getHelpRequestRoute,
  listHelpRequestsRoute,
  logContactRoute,
  reopenHelpRoute,
  updateHelpStatusRoute,
} from './routes/help-routes';
import {
  addTaskCommentRoute,
  attendanceOverviewRoute,
  attendanceRoute,
  attendanceSignInRoute,
  createMeetingRoute,
  createResolutionRoute,
  createTaskRoute,
  getMeetingRoute,
  getTaskRoute,
  listMeetingsRoute,
  listTasksRoute,
  submitMinutesRoute,
  updateMeetingRoute,
  updateTaskRoute,
} from './routes/meeting-routes';
import {
  approvalsRoute,
  createCalendarEventRoute,
  createCorrespondenceRoute,
  createDocumentRoute,
  createTemplateRoute,
  deleteCalendarEventRoute,
  deleteTemplateRoute,
  documentPdfRoute,
  downloadAttachmentRoute,
  getDocumentRoute,
  listAttachmentsRoute,
  listCalendarRoute,
  listCorrespondenceRoute,
  listDocumentsRoute,
  listTemplatesRoute,
  renderTemplateRoute,
  reviewDocumentRoute,
  submitDocumentRoute,
  updateCalendarEventRoute,
  updateCorrespondenceRoute,
  updateDocumentRoute,
  updateTemplateRoute,
  uploadAttachmentRoute,
} from './routes/document-routes';
import {
  createDocumentSubmissionRoute,
  downloadDocumentSubmissionRoute,
  listDocumentSubmissionsRoute,
  submitKeptDocumentRoute,
  updateDocumentSubmissionRoute,
} from './routes/document-submission-routes';
import {
  briefingOverviewRoute,
  briefingPdfRoute,
  consolidatedReportsRoute,
  createBriefingRoute,
  createReportRoute,
  finalizeReportRoute,
  getBriefingRoute,
  getReportRoute,
  listBriefingsRoute,
  listReportsRoute,
  reportOverviewRoute,
  reportPdfRoute,
  updateReportRoute,
} from './routes/report-routes';
import {
  adminAuditLogsRoute,
  adminDeliveryLogsRoute,
  adminProviderStatusRoute,
  createAdminUserRoute,
  listAdminUsersRoute,
  resetUserPasswordRoute,
  sendActivationLinkRoute,
  updateAdminUserRoute,
} from './routes/admin-routes';
import {
  createAnnouncementRoute,
  createMessageRoute,
  cronRoute,
  deliveryLogsRoute,
  directoryRoute,
  globalSearchRoute,
  healthRoute,
  listAnnouncementsRoute,
  listMessagesRoute,
  listNotificationsRoute,
  markAllNotificationsReadRoute,
  markMessageReadRoute,
  markNotificationReadRoute,
  providerStatusRoute,
  realtimeStreamRoute,
  runMaintenanceRoute,
} from './routes/communication-routes';

type Handler = (ctx: ApiContext) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: string;
  handler: Handler;
  public?: boolean;
  cron?: boolean;
  csrf?: boolean;
}

const routes: Route[] = [
  // Public and scheduled endpoints.
  { method: 'GET', pattern: '/health', handler: healthRoute, public: true },
  { method: 'GET', pattern: '/cron/run', handler: cronRoute, cron: true },
  { method: 'POST', pattern: '/auth/login', handler: loginRoute, public: true },
  { method: 'POST', pattern: '/auth/forgot-password', handler: forgotPasswordRoute, public: true },
  { method: 'POST', pattern: '/auth/reset-password', handler: resetPasswordRoute, public: true },
  { method: 'GET', pattern: '/push/public-key', handler: pushPublicKeyRoute, public: true },

  // Session, profile and workspace settings.
  { method: 'POST', pattern: '/auth/logout', handler: logoutRoute },
  { method: 'POST', pattern: '/auth/logout-all', handler: logoutAllRoute },
  { method: 'GET', pattern: '/auth/me', handler: meRoute },
  { method: 'PATCH', pattern: '/profile', handler: updateProfileRoute },
  { method: 'POST', pattern: '/profile/password', handler: changePasswordRoute },
  { method: 'GET', pattern: '/profile/sessions', handler: sessionsRoute },
  { method: 'DELETE', pattern: '/profile/sessions/:id', handler: revokeSessionRoute },
  { method: 'GET', pattern: '/profile/activity', handler: activityRoute },
  { method: 'GET', pattern: '/profile/preferences', handler: getPreferencesRoute },
  { method: 'PATCH', pattern: '/profile/preferences', handler: updatePreferencesRoute },
  { method: 'POST', pattern: '/push/subscribe', handler: pushSubscribeRoute },
  { method: 'DELETE', pattern: '/push/subscribe', handler: pushUnsubscribeRoute },
  { method: 'GET', pattern: '/organizations', handler: organizationsRoute },
  { method: 'GET', pattern: '/organizations/:id/settings', handler: organizationSettingsRoute },
  { method: 'PATCH', pattern: '/organizations/:id/settings', handler: updateOrganizationSettingsRoute },

  // Dashboards, search, realtime and maintenance.
  { method: 'GET', pattern: '/dashboard', handler: dashboardRoute },
  { method: 'GET', pattern: '/events/stream', handler: realtimeStreamRoute },
  { method: 'GET', pattern: '/search', handler: globalSearchRoute },
  { method: 'GET', pattern: '/provider-status', handler: providerStatusRoute },
  { method: 'POST', pattern: '/maintenance/run', handler: runMaintenanceRoute },

  // Notifications, messages, announcements and directory.
  { method: 'GET', pattern: '/notifications', handler: listNotificationsRoute },
  { method: 'POST', pattern: '/notifications/read-all', handler: markAllNotificationsReadRoute },
  { method: 'PATCH', pattern: '/notifications/:id/read', handler: markNotificationReadRoute },
  { method: 'GET', pattern: '/notification-deliveries', handler: deliveryLogsRoute },
  { method: 'GET', pattern: '/messages', handler: listMessagesRoute },
  { method: 'POST', pattern: '/messages', handler: createMessageRoute },
  { method: 'PATCH', pattern: '/messages/:id/read', handler: markMessageReadRoute },
  { method: 'GET', pattern: '/announcements', handler: listAnnouncementsRoute },
  { method: 'POST', pattern: '/announcements', handler: createAnnouncementRoute },
  { method: 'GET', pattern: '/directory', handler: directoryRoute },

  // Urgent HELP workflow.
  { method: 'GET', pattern: '/help-requests', handler: listHelpRequestsRoute },
  { method: 'POST', pattern: '/help-requests', handler: createHelpRequestRoute },
  { method: 'POST', pattern: '/help-requests/:id/acknowledge', handler: acknowledgeHelpRoute },
  { method: 'PATCH', pattern: '/help-requests/:id/status', handler: updateHelpStatusRoute },
  { method: 'POST', pattern: '/help-requests/:id/reopen', handler: reopenHelpRoute },
  { method: 'POST', pattern: '/help-requests/:id/updates', handler: addHelpUpdateRoute },
  { method: 'POST', pattern: '/help-requests/:id/contact', handler: logContactRoute },
  { method: 'GET', pattern: '/help-requests/:id', handler: getHelpRequestRoute },

  // Meetings, resolutions, attendance and tasks.
  { method: 'GET', pattern: '/attendance/sign-in', handler: attendanceOverviewRoute },
  { method: 'POST', pattern: '/attendance/sign-in', handler: attendanceSignInRoute },
  { method: 'GET', pattern: '/meetings', handler: listMeetingsRoute },
  { method: 'POST', pattern: '/meetings', handler: createMeetingRoute },
  { method: 'POST', pattern: '/meetings/:id/attendance', handler: attendanceRoute },
  { method: 'POST', pattern: '/meetings/:id/resolutions', handler: createResolutionRoute },
  { method: 'POST', pattern: '/meetings/:id/submit-minutes', handler: submitMinutesRoute },
  { method: 'PATCH', pattern: '/meetings/:id', handler: updateMeetingRoute },
  { method: 'GET', pattern: '/meetings/:id', handler: getMeetingRoute },
  { method: 'GET', pattern: '/tasks', handler: listTasksRoute },
  { method: 'POST', pattern: '/tasks', handler: createTaskRoute },
  { method: 'POST', pattern: '/tasks/:id/comments', handler: addTaskCommentRoute },
  { method: 'PATCH', pattern: '/tasks/:id', handler: updateTaskRoute },
  { method: 'GET', pattern: '/tasks/:id', handler: getTaskRoute },

  // Documents, approvals, templates, submissions, correspondence, calendar and attachments.
  { method: 'GET', pattern: '/document-submissions', handler: listDocumentSubmissionsRoute },
  { method: 'POST', pattern: '/document-submissions', handler: createDocumentSubmissionRoute },
  { method: 'POST', pattern: '/document-submissions/:id/submit', handler: submitKeptDocumentRoute },
  { method: 'PATCH', pattern: '/document-submissions/:id', handler: updateDocumentSubmissionRoute },
  { method: 'GET', pattern: '/document-submissions/:id/file', handler: downloadDocumentSubmissionRoute },
  { method: 'GET', pattern: '/documents', handler: listDocumentsRoute },
  { method: 'POST', pattern: '/documents', handler: createDocumentRoute },
  { method: 'GET', pattern: '/approvals', handler: approvalsRoute },
  { method: 'POST', pattern: '/documents/:id/submit', handler: submitDocumentRoute },
  { method: 'POST', pattern: '/documents/:id/review', handler: reviewDocumentRoute },
  { method: 'GET', pattern: '/documents/:id/pdf', handler: documentPdfRoute },
  { method: 'PATCH', pattern: '/documents/:id', handler: updateDocumentRoute },
  { method: 'GET', pattern: '/documents/:id', handler: getDocumentRoute },
  { method: 'GET', pattern: '/templates', handler: listTemplatesRoute },
  { method: 'POST', pattern: '/templates', handler: createTemplateRoute },
  { method: 'POST', pattern: '/templates/render', handler: renderTemplateRoute },
  { method: 'PATCH', pattern: '/templates/:id', handler: updateTemplateRoute },
  { method: 'DELETE', pattern: '/templates/:id', handler: deleteTemplateRoute },
  { method: 'GET', pattern: '/correspondence', handler: listCorrespondenceRoute },
  { method: 'POST', pattern: '/correspondence', handler: createCorrespondenceRoute },
  { method: 'PATCH', pattern: '/correspondence/:id', handler: updateCorrespondenceRoute },
  { method: 'GET', pattern: '/calendar', handler: listCalendarRoute },
  { method: 'POST', pattern: '/calendar', handler: createCalendarEventRoute },
  { method: 'PATCH', pattern: '/calendar/:id', handler: updateCalendarEventRoute },
  { method: 'DELETE', pattern: '/calendar/:id', handler: deleteCalendarEventRoute },
  { method: 'POST', pattern: '/attachments', handler: uploadAttachmentRoute },
  { method: 'GET', pattern: '/attachments', handler: listAttachmentsRoute },
  { method: 'GET', pattern: '/attachments/:id', handler: downloadAttachmentRoute },

  // Record-based reports and briefing packs.
  { method: 'GET', pattern: '/reports/overview', handler: reportOverviewRoute },
  { method: 'GET', pattern: '/reports/consolidated', handler: consolidatedReportsRoute },
  { method: 'GET', pattern: '/reports', handler: listReportsRoute },
  { method: 'POST', pattern: '/reports', handler: createReportRoute },
  { method: 'POST', pattern: '/reports/:id/finalize', handler: finalizeReportRoute },
  { method: 'GET', pattern: '/reports/:id/pdf', handler: reportPdfRoute },
  { method: 'PATCH', pattern: '/reports/:id', handler: updateReportRoute },
  { method: 'GET', pattern: '/reports/:id', handler: getReportRoute },
  { method: 'GET', pattern: '/briefings/overview', handler: briefingOverviewRoute },
  { method: 'GET', pattern: '/briefings', handler: listBriefingsRoute },
  { method: 'POST', pattern: '/briefings', handler: createBriefingRoute },
  { method: 'GET', pattern: '/briefings/:id/pdf', handler: briefingPdfRoute },
  { method: 'GET', pattern: '/briefings/:id', handler: getBriefingRoute },

  // Administration.
  { method: 'GET', pattern: '/admin/users', handler: listAdminUsersRoute },
  { method: 'POST', pattern: '/admin/users', handler: createAdminUserRoute },
  { method: 'POST', pattern: '/admin/users/:id/reset', handler: resetUserPasswordRoute },
  { method: 'POST', pattern: '/admin/users/:id/activation', handler: sendActivationLinkRoute },
  { method: 'PATCH', pattern: '/admin/users/:id', handler: updateAdminUserRoute },
  { method: 'GET', pattern: '/admin/audit-logs', handler: adminAuditLogsRoute },
  { method: 'GET', pattern: '/admin/delivery-logs', handler: adminDeliveryLogsRoute },
  { method: 'GET', pattern: '/admin/provider-status', handler: adminProviderStatusRoute },
];

function compilePattern(pattern: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const source = pattern
    .split('/')
    .map((segment) => {
      if (!segment) return '';
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${source || '/'}/?$`), keys };
}

const compiledRoutes = routes.map((route) => ({ ...route, ...compilePattern(route.pattern) }));

function matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } | null {
  for (const compiled of compiledRoutes) {
    if (compiled.method !== method) continue;
    const match = compiled.regex.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    compiled.keys.forEach((key, index) => {
      try {
        params[key] = decodeURIComponent(match[index + 1] || '');
      } catch {
        params[key] = match[index + 1] || '';
      }
    });
    return { route: compiled, params };
  }
  return null;
}

export async function handleApi(request: Request, segments: string[] = []): Promise<Response> {
  try {
    const runtime = await getRuntime();
    const path = `/${segments.join('/')}`;
    const method = request.method.toUpperCase();
    const matched = matchRoute(method, path);
    if (!matched) return json({ error: `No ${method} endpoint exists at /api${path}.` }, 404);

    let auth: AuthContext | null = null;
    if (!matched.route.public && !matched.route.cron) {
      auth = await authenticate(runtime.db, request, runtime.config);
      if (!auth) {
        if (runtime.config.previewSessionFallback) {
          console.warn('[preview-auth] unauthenticated request', {
            path,
            hasCookie: Boolean(request.headers.get('cookie')),
            hasAuthorization: Boolean(request.headers.get('authorization')),
            hasSessionHeader: Boolean(request.headers.get('x-session-token')),
            hasSessionQuery: new URL(request.url).searchParams.has('session_token'),
            origin: request.headers.get('origin'),
            secFetchSite: request.headers.get('sec-fetch-site'),
          });
        }
        return json({ error: 'Please sign in to continue.' }, 401);
      }
      const safeMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
      if (!safeMethod && matched.route.csrf !== false) requireCsrf(auth, request);
    }

    const ctx: ApiContext = {
      request,
      url: new URL(request.url),
      method,
      path,
      params: matched.params,
      runtime,
      auth,
    };
    return await matched.route.handler(ctx);
  } catch (error) {
    return apiError(error);
  }
}
