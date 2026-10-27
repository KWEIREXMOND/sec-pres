import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestRuntime, setRuntime, type Runtime } from '../server/runtime';
import { handleApi } from '../server/router';
import { clearSessionCookie, sessionCookie } from '../server/utils';

let runtime: Runtime;
let presidentCookie = '';
let presidentCsrf = '';
let secretaryCookie = '';
let secretaryCsrf = '';
let helpId = '';
let documentId = '';

interface CallResult<T = any> {
  status: number;
  data: T;
  cookie: string;
  contentType: string;
}

function request(method: string, url: string, body?: unknown, cookie = '', csrf = ''): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  return new Request(`http://localhost:3000/api${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call<T = any>(method: string, url: string, body?: unknown, cookie = '', csrf = ''): Promise<CallResult<T>> {
  const pathOnly = url.split('?')[0];
  const segments = pathOnly.split('/').filter(Boolean);
  const response = await handleApi(request(method, url, body, cookie, csrf), segments);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : (await response.text()) as unknown as T;
  return { status: response.status, data: data as T, cookie: (response.headers.get('set-cookie') || '').split(';')[0], contentType };
}

function sourceFiles(directory: string, output: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (['node_modules', '.next', '.git', 'data', 'dist', 'coverage'].includes(entry)) continue;
    const full = path.join(directory, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) sourceFiles(full, output);
    else if (/\.(ts|tsx|js|mjs|sql|md|json|css|html)$/.test(entry) && entry !== 'package-lock.json') output.push(full);
  }
  return output;
}

beforeAll(async () => {
  runtime = await createTestRuntime({ seed: true, config: { previewSessionFallback: true } });
  setRuntime(runtime);
});

afterAll(async () => {
  await runtime.db.close();
});

describe('Tema Secondary School SRC API', () => {
  it('reports a healthy persistent backend', async () => {
    const result = await call('GET', '/health');
    expect(result.status).toBe(200);
    expect(result.data.ok).toBe(true);
    expect(result.data.database).toBe('pglite');
  });

  it('keeps preview sessions working when browser cookies are unavailable', async () => {
    const login = await call('POST', '/auth/login', { email: 'school.president@srcpro.test', password: 'President123!' });
    expect(login.status).toBe(200);
    expect(typeof login.data.sessionToken).toBe('string');
    expect(login.data.sessionToken.length).toBeGreaterThan(20);

    const meRequest = new Request('http://localhost:3000/api/auth/me', {
      headers: { Authorization: `Bearer ${login.data.sessionToken}` },
    });
    const meResponse = await handleApi(meRequest, ['auth', 'me']);
    expect(meResponse.status).toBe(200);
    const meData = await meResponse.json();
    expect(meData.user.role).toBe('school_president');

    const headerRequest = new Request('http://localhost:3000/api/auth/me', {
      headers: { 'X-Session-Token': login.data.sessionToken },
    });
    const headerResponse = await handleApi(headerRequest, ['auth', 'me']);
    expect(headerResponse.status).toBe(200);

    const queryRequest = new Request(`http://localhost:3000/api/auth/me?session_token=${encodeURIComponent(login.data.sessionToken)}`);
    const queryResponse = await handleApi(queryRequest, ['auth', 'me']);
    expect(queryResponse.status).toBe(200);

    const csrfQueryRequest = new Request(
      `http://localhost:3000/api/notifications/read-all?session_token=${encodeURIComponent(login.data.sessionToken)}&csrf_token=${encodeURIComponent(login.data.csrfToken)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
    const csrfQueryResponse = await handleApi(csrfQueryRequest, ['notifications', 'read-all']);
    expect(csrfQueryResponse.status).toBe(200);

    const logoutRequest = new Request('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${login.data.sessionToken}`,
        'Content-Type': 'application/json',
        'X-CSRF-Token': login.data.csrfToken,
      },
      body: '{}',
    });
    const logoutResponse = await handleApi(logoutRequest, ['auth', 'logout']);
    expect(logoutResponse.status).toBe(200);
  });

  it('logs in a School President and creates an idempotent urgent HELP request', async () => {
    const login = await call('POST', '/auth/login', { email: 'school.president@srcpro.test', password: 'President123!' });
    expect(login.status).toBe(200);
    expect(login.data.user.role).toBe('school_president');
    presidentCookie = login.cookie;
    presidentCsrf = login.data.csrfToken;

    const clientRequestId = `test-help-${Date.now()}`;
    const body = {
      organizationId: 'org-tema-secondary-src',
      clientRequestId,
      requestType: 'Urgent Assistance',
      subject: 'Prepare emergency brief',
      description: 'Prepare the verified emergency brief for review.',
      location: 'Presidential Office',
      priority: 'urgent',
      channel: 'in_app',
    };
    const created = await call('POST', '/help-requests', body, presidentCookie, presidentCsrf);
    expect(created.status).toBe(201);
    expect(created.data.reference).toMatch(/^HELP-/);
    expect(created.data.assignedTo).toBe('user-school-secretary');
    expect(created.data.deliveryStatus.some((item: any) => item.channel === 'in_app' && item.status === 'delivered')).toBe(true);
    helpId = created.data.request.id;

    const duplicate = await call('POST', '/help-requests', body, presidentCookie, presidentCsrf);
    expect(duplicate.status).toBe(200);
    expect(duplicate.data.duplicate).toBe(true);

    const list = await call('GET', '/help-requests', undefined, presidentCookie, presidentCsrf);
    expect(list.status).toBe(200);
    expect(list.data.requests.some((item: any) => item.id === helpId)).toBe(true);
  });

  it('lets the School Secretary acknowledge and progress the request while preserving history', async () => {
    const login = await call('POST', '/auth/login', { email: 'school.secretary@srcpro.test', password: 'Secretary123!' });
    expect(login.status).toBe(200);
    secretaryCookie = login.cookie;
    secretaryCsrf = login.data.csrfToken;

    const acknowledged = await call('POST', `/help-requests/${helpId}/acknowledge`, {}, secretaryCookie, secretaryCsrf);
    expect(acknowledged.status).toBe(200);
    expect(acknowledged.data.request.status).toBe('acknowledged');
    expect(acknowledged.data.request.acknowledged_at).toBeTruthy();

    const progressed = await call('PATCH', `/help-requests/${helpId}/status`, { status: 'in_progress', comment: 'Records are being reviewed.' }, secretaryCookie, secretaryCsrf);
    expect(progressed.status).toBe(200);
    expect(progressed.data.request.status).toBe('in_progress');
    expect(progressed.data.request.history.length).toBeGreaterThanOrEqual(3);

    const update = await call('POST', `/help-requests/${helpId}/updates`, { kind: 'progress', message: 'The brief has been prepared.' }, secretaryCookie, secretaryCsrf);
    expect(update.status).toBe(201);
    expect(update.data.request.updates.length).toBeGreaterThan(0);

    const contact = await call('POST', `/help-requests/${helpId}/contact`, { channel: 'call', contactUserId: 'user-school-president' }, secretaryCookie, secretaryCsrf);
    expect(contact.status).toBe(200);
    expect(contact.data.links.call).toMatch(/^tel:/);
  });

  it('supports manual documents, presidential approval and server-generated PDF', async () => {
    const created = await call('POST', '/documents', {
      organizationId: 'org-tema-secondary-src',
      title: 'Manual official letter',
      kind: 'letter',
      category: 'Official Correspondence',
      subject: 'Verified manual letter',
      recipient: 'Regional Director',
      content: 'This letter was written manually in the editor.',
      tags: 'test,manual',
      status: 'draft',
    }, secretaryCookie, secretaryCsrf);
    expect(created.status).toBe(201);
    documentId = created.data.document.id;

    const submitted = await call('POST', `/documents/${documentId}/submit`, {}, secretaryCookie, secretaryCsrf);
    expect(submitted.status).toBe(200);
    expect(submitted.data.document.status).toBe('pending_approval');

    const reviewed = await call('POST', `/documents/${documentId}/review`, { decision: 'approved', comment: 'Approved after manual review.' }, presidentCookie, presidentCsrf);
    expect(reviewed.status).toBe(200);
    expect(reviewed.data.document.status).toBe('approved');
    expect(reviewed.data.document.reviews.length).toBe(1);

    const pdf = await call('GET', `/documents/${documentId}/pdf`, undefined, secretaryCookie, secretaryCsrf);
    expect(pdf.status).toBe(200);
    expect(pdf.contentType).toContain('application/pdf');
  });

  it('builds reports from saved records and exports them as PDF', async () => {
    const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const end = new Date().toISOString().slice(0, 10);
    const overview = await call('GET', `/reports/overview?reportType=monthly&periodStart=${start}&periodEnd=${end}`, undefined, secretaryCookie, secretaryCsrf);
    expect(overview.status).toBe(200);
    expect(overview.data.content.sections.length).toBeGreaterThan(0);

    const created = await call('POST', '/reports', { organizationId: 'org-tema-secondary-src', reportType: 'monthly', periodStart: start, periodEnd: end }, secretaryCookie, secretaryCsrf);
    expect(created.status).toBe(201);
    expect(created.data.report.status).toBe('draft');

    const pdf = await call('GET', `/reports/${created.data.report.id}/pdf`, undefined, secretaryCookie, secretaryCsrf);
    expect(pdf.status).toBe(200);
    expect(pdf.contentType).toContain('application/pdf');
  });

  it('enforces role and organization boundaries', async () => {
    const executiveLogin = await call('POST', '/auth/login', { email: 'executive@srcpro.test', password: 'Executive123!' });
    expect(executiveLogin.status).toBe(200);
    const forbidden = await call('POST', '/help-requests', {
      organizationId: 'org-tema-secondary-src',
      clientRequestId: `forbidden-${Date.now()}`,
      subject: 'Unauthorized request',
      description: 'This executive cannot create presidential HELP requests.',
      location: 'Test office',
      priority: 'urgent',
    }, executiveLogin.cookie, executiveLogin.data.csrfToken);
    expect(forbidden.status).toBe(403);

    const zonalLogin = await call('POST', '/auth/login', { email: 'zonal.president@srcpro.test', password: 'President123!' });
    expect(zonalLogin.status).toBe(200);
    const crossWorkspace = await call('GET', `/help-requests/${helpId}?organizationId=org-tema-secondary-zone`, undefined, zonalLogin.cookie, zonalLogin.data.csrfToken);
    expect(crossWorkspace.status).toBe(404);
  });

  it('records executive meeting attendance and lets leadership monitor it', async () => {
    const overview = await call('GET', '/attendance/sign-in?organizationId=org-tema-secondary-src', undefined, secretaryCookie, secretaryCsrf);
    expect(overview.status).toBe(200);
    expect(overview.data.canSignIn).toBe(true);
    expect(overview.data.meetings.length).toBeGreaterThan(0);
    expect(overview.data.executives.length).toBeGreaterThan(3);
    const meetingId = overview.data.selectedMeetingId;
    const executive = overview.data.executives.find((item: any) => item.role === 'executive');
    expect(executive).toBeTruthy();

    const signed = await call('POST', '/attendance/sign-in?organizationId=org-tema-secondary-src', {
      meetingId,
      userId: executive.id,
      attendance: 'present',
      note: 'Signed in at the SRC office.',
    }, secretaryCookie, secretaryCsrf);
    expect(signed.status).toBe(200);
    expect(signed.data.attendance).toBe('present');

    const monitor = await call('GET', `/attendance/sign-in?organizationId=org-tema-secondary-src&meetingId=${meetingId}`, undefined, presidentCookie, presidentCsrf);
    expect(monitor.status).toBe(200);
    const updated = monitor.data.executives.find((item: any) => item.id === executive.id);
    expect(updated.attendance).toBe('present');
    expect(updated.signed_in_by_name).toContain('Efua');
    expect(monitor.data.recentSignIns.some((item: any) => item.user_id === executive.id)).toBe(true);

    const notifications = await call('GET', '/notifications?organizationId=org-tema-secondary-src', undefined, presidentCookie, presidentCsrf);
    expect(notifications.status).toBe(200);
    expect(notifications.data.notifications.some((item: any) => item.type === 'attendance_signed_in')).toBe(true);
  });

  it('lets users upload, keep, submit, download and review documents', async () => {
    const form = new FormData();
    form.set('organizationId', 'org-tema-secondary-src');
    form.set('title', 'Executive handover note');
    form.set('description', 'Verified handover note for presidential review.');
    form.set('deliveryMode', 'kept');
    form.set('file', new File(['Verified TSS SRC handover content.'], 'handover.txt', { type: 'text/plain' }));

    const createRequest = new Request('http://localhost:3000/api/document-submissions?organizationId=org-tema-secondary-src', {
      method: 'POST',
      headers: { Cookie: secretaryCookie, 'X-CSRF-Token': secretaryCsrf },
      body: form,
    });
    const created = await handleApi(createRequest, ['document-submissions']);
    expect(created.status).toBe(201);
    const createdData = await created.json();
    const submissionId = createdData.submission.id as string;
    expect(createdData.submission.delivery_mode).toBe('kept');
    expect(createdData.submission.file_name).toBe('handover.txt');

    const keptList = await call('GET', '/document-submissions?organizationId=org-tema-secondary-src', undefined, secretaryCookie, secretaryCsrf);
    expect(keptList.status).toBe(200);
    expect(keptList.data.submissions.some((item: any) => item.id === submissionId)).toBe(true);
    expect(keptList.data.people.length).toBeGreaterThan(0);

    const submitted = await call('POST', `/document-submissions/${submissionId}/submit?organizationId=org-tema-secondary-src`, { recipientId: 'user-school-president' }, secretaryCookie, secretaryCsrf);
    expect(submitted.status).toBe(200);
    expect(submitted.data.submission.delivery_mode).toBe('submitted');
    expect(submitted.data.submission.recipient_id).toBe('user-school-president');

    const inbox = await call('GET', '/document-submissions?organizationId=org-tema-secondary-src', undefined, presidentCookie, presidentCsrf);
    expect(inbox.status).toBe(200);
    expect(inbox.data.submissions.some((item: any) => item.id === submissionId && item.recipient_id === 'user-school-president')).toBe(true);

    const fileRequest = new Request(`http://localhost:3000/api/document-submissions/${submissionId}/file?organizationId=org-tema-secondary-src`, {
      headers: { Cookie: presidentCookie },
    });
    const fileResponse = await handleApi(fileRequest, ['document-submissions', submissionId, 'file']);
    expect(fileResponse.status).toBe(200);
    expect(await fileResponse.text()).toContain('Verified TSS SRC handover content.');

    const reviewed = await call('PATCH', `/document-submissions/${submissionId}?organizationId=org-tema-secondary-src`, { status: 'reviewed' }, presidentCookie, presidentCsrf);
    expect(reviewed.status).toBe(200);
    expect(reviewed.data.submission.status).toBe('reviewed');
  });

  it('supports cross-site preview session cookies and clears them with matching attributes', () => {
    const config = { secure: true, sameSite: 'none' as const, partitioned: true };
    const created = sessionCookie('preview-session-token', 3600, config);
    const cleared = clearSessionCookie(config);
    for (const cookie of [created, cleared]) {
      expect(cookie).toContain('; Secure');
      expect(cookie).toContain('SameSite=None');
      expect(cookie).toContain('; Partitioned');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('HttpOnly');
    }
  });

  it('contains no prohibited content-generation integrations or environment keys', () => {
    const banned = [
      Buffer.from('T3BlbkFJ', 'base64').toString(),
      Buffer.from('QW50aHJvcGlj', 'base64').toString(),
      Buffer.from('R2VtaW5p', 'base64').toString(),
      Buffer.from('Q2hhdEdQVA==', 'base64').toString(),
      Buffer.from('QUkgQXNzaXN0YW50', 'base64').toString(),
      Buffer.from('YWktc2Rr', 'base64').toString(),
    ];
    const standalone = String.fromCharCode(65, 73);
    const packageJson = readFileSync('package.json', 'utf8');
    const envExample = readFileSync('.env.example', 'utf8');
    const files = sourceFiles('.');
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const hasStandalone = new RegExp(`\\b${standalone}\\b`, 'i').test(content);
      expect(hasStandalone, `${file} contains a prohibited standalone term`).toBe(false);
      for (const word of banned) {
        expect(content.toLowerCase().includes(word.toLowerCase()), `${file} contains ${word}`).toBe(false);
      }
    }
    expect(packageJson).not.toContain('api-key');
    expect(envExample.toLowerCase()).not.toContain('model api key');
  });
});
