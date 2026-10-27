import type { AuthUser, Organization, Role } from '@/lib/shared-types';
import type { Database } from './db';
import { HttpError } from './utils';

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
  csrfToken: string;
  realtimeToken: string;
  sessionExpiresAt: string;
}

const ORGANIZATION_ALIASES: Record<string, string> = {
  'org-accra-academy-src': 'org-tema-secondary-src',
  'org-greater-accra-zone': 'org-tema-secondary-zone',
};

function normalizeOrganizationId(organizationId: string | null): string | null {
  if (!organizationId) return organizationId;
  return ORGANIZATION_ALIASES[organizationId] || organizationId;
}

export interface OrganizationAccess {
  organization: Organization;
  membershipRole: string;
  isPrimarySecretary: boolean;
  canViewConsolidated: boolean;
  isConsolidatedViewer: boolean;
}

const ADMIN_PERMISSIONS = [
  'manage_users',
  'manage_organizations',
  'manage_meetings',
  'manage_documents',
  'submit_documents',
  'review_documents',
  'manage_correspondence',
  'manage_tasks',
  'manage_help',
  'create_help',
  'create_meeting_request',
  'view_reports',
  'compile_reports',
  'view_briefings',
  'view_directory',
  'view_contact_details',
  'manage_templates',
  'create_announcements',
  'view_delivery_logs',
  'view_audit_logs',
  'run_maintenance',
  'manage_settings',
];

const SECRETARY_PERMISSIONS = [
  'manage_meetings',
  'manage_documents',
  'submit_documents',
  'manage_correspondence',
  'manage_tasks',
  'manage_help',
  'create_meeting_request',
  'view_reports',
  'compile_reports',
  'view_briefings',
  'view_directory',
  'view_contact_details',
  'manage_templates',
  'create_announcements',
  'view_delivery_logs',
  'run_maintenance',
  'manage_settings',
];

const PRESIDENT_PERMISSIONS = [
  'create_help',
  'create_meeting_request',
  'review_documents',
  'view_reports',
  'view_briefings',
  'view_directory',
  'view_contact_details',
  'update_own_tasks',
  'create_announcements',
  'view_audit_logs',
];

const VICE_PRESIDENT_PERMISSIONS = [
  'create_help',
  'create_meeting_request',
  'view_reports',
  'view_briefings',
  'view_directory',
  'view_contact_details',
  'update_own_tasks',
];

const EXECUTIVE_PERMISSIONS = [
  'view_directory',
  'update_own_tasks',
];

export function permissionsForRole(role: Role): string[] {
  switch (role) {
    case 'system_admin':
      return ADMIN_PERMISSIONS;
    case 'school_secretary':
    case 'zonal_secretary':
      return SECRETARY_PERMISSIONS;
    case 'school_president':
    case 'zonal_president':
      return PRESIDENT_PERMISSIONS;
    case 'vice_president':
      return VICE_PRESIDENT_PERMISSIONS;
    case 'executive':
    default:
      return EXECUTIVE_PERMISSIONS;
  }
}

export function isAdmin(auth: AuthContext): boolean {
  return auth.user.role === 'system_admin';
}

export function isPresident(auth: AuthContext): boolean {
  return auth.user.role === 'school_president' || auth.user.role === 'zonal_president';
}

export function isSecretary(auth: AuthContext): boolean {
  return auth.user.role === 'school_secretary' || auth.user.role === 'zonal_secretary';
}

export function isLeadership(auth: AuthContext): boolean {
  return isAdmin(auth) || isPresident(auth) || isSecretary(auth) || auth.user.role === 'vice_president';
}

export function hasPermission(auth: AuthContext, permission: string): boolean {
  return auth.user.permissions.includes(permission);
}

export function assertPermission(auth: AuthContext, permission: string): void {
  if (!hasPermission(auth, permission)) {
    throw new HttpError(403, 'Your role does not have permission to perform this action.');
  }
}

export function roleLabel(role: Role): string {
  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function dashboardKind(role: Role): 'president' | 'secretary' | 'executive' | 'admin' {
  if (role === 'school_president' || role === 'zonal_president') return 'president';
  if (role === 'school_secretary' || role === 'zonal_secretary') return 'secretary';
  if (role === 'system_admin') return 'admin';
  return 'executive';
}

export function requestedOrganizationId(request: Request): string | null {
  const url = new URL(request.url);
  return normalizeOrganizationId(url.searchParams.get('organizationId') || request.headers.get('x-organization-id'));
}

export async function getOrganizationAccess(
  _db: Database,
  auth: AuthContext,
  organizationId: string | null,
  options: { requireRecords?: boolean } = {},
): Promise<OrganizationAccess> {
  const id = normalizeOrganizationId(organizationId) || auth.user.organizations[0]?.id;
  const organization = auth.user.organizations.find((item) => item.id === id);
  if (!organization) {
    throw new HttpError(403, 'You are not authorized to access this workspace.');
  }
  const isConsolidatedViewer = organization.membership_role === 'consolidated_viewer';
  if (options.requireRecords !== false && isConsolidatedViewer) {
    throw new HttpError(403, 'This membership allows consolidated summaries only, not individual school records.');
  }
  return {
    organization,
    membershipRole: organization.membership_role,
    isPrimarySecretary: Boolean(organization.is_primary_secretary),
    canViewConsolidated: Boolean(organization.can_view_consolidated),
    isConsolidatedViewer,
  };
}

export async function getConsolidatedOrganizationIds(
  db: Database,
  auth: AuthContext,
  organizationId: string,
): Promise<string[]> {
  organizationId = normalizeOrganizationId(organizationId) || organizationId;
  const access = await getOrganizationAccess(db, auth, organizationId, { requireRecords: false });
  if (!access.canViewConsolidated || access.organization.type !== 'zonal') {
    throw new HttpError(403, 'Consolidated reports are available only in an authorized zonal workspace.');
  }
  const result = await db.query<{ id: string }>(
    `SELECT id FROM organizations
     WHERE id = $1 OR parent_id = $1
     ORDER BY CASE WHEN id = $1 THEN 0 ELSE 1 END, name`,
    [organizationId],
  );
  return result.rows.map((row) => String(row.id));
}

export function canViewPhone(auth: AuthContext, targetUserId: string): boolean {
  if (auth.user.id === targetUserId) return true;
  return hasPermission(auth, 'view_contact_details') || isLeadership(auth);
}

export function maskPhone(phone: string): string {
  if (!phone) return 'Not available';
  const visible = phone.slice(-4);
  return `${'•'.repeat(Math.max(0, phone.length - 4))}${visible}`;
}
