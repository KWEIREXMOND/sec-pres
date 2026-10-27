import { BRAND } from '../lib/brand';

function env(key: string, fallback = ''): string {
  return (process.env[key] || fallback).trim();
}

function boolEnv(key: string, fallback: boolean): boolean {
  const value = env(key);
  if (!value) return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

function intEnv(key: string, fallback: number): number {
  const value = Number(env(key));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  storageBucket: string;
  realtimePrefix: string;
  authEnabled: boolean;
  realtimeEnabled: boolean;
}

export interface SessionCookieConfig {
  secure: boolean;
  sameSite: 'lax' | 'none' | 'strict';
  partitioned: boolean;
}

export interface AppConfig {
  nodeEnv: string;
  databaseUrl: string;
  localDatabasePath: string;
  seedDemoData: boolean;
  showResetLinks: boolean;
  appBaseUrl: string;
  sessionTtlDays: number;
  helpEscalationMinutes: number;
  cronSecret: string;
  maxUploadBytes: number;
  backupDir: string;
  sessionCookie: SessionCookieConfig;
  previewSessionFallback: boolean;
  supabase: SupabaseConfig;
  providers: {
    resendApiKey: string;
    notificationFromEmail: string;
    twilioAccountSid: string;
    twilioAuthToken: string;
    twilioFromNumber: string;
    twilioWhatsappFrom: string;
    vapidPublicKey: string;
    vapidPrivateKey: string;
    vapidSubject: string;
  };
}

export function getConfig(): AppConfig {
  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const nodeEnv = env('NODE_ENV', 'development');
  const previewSandbox = boolEnv('E2B_SANDBOX', false);
  const requestedSameSite = env('COOKIE_SAME_SITE', previewSandbox ? 'none' : 'lax').toLowerCase();
  const cookieSameSite: SessionCookieConfig['sameSite'] = requestedSameSite === 'none' || requestedSameSite === 'strict'
    ? requestedSameSite
    : 'lax';
  const cookieSecure = boolEnv('COOKIE_SECURE', previewSandbox || nodeEnv === 'production') || cookieSameSite === 'none';
  const cookiePartitioned = boolEnv('COOKIE_PARTITIONED', previewSandbox) && cookieSameSite === 'none';
  const previewSessionFallback = boolEnv('SESSION_TOKEN_FALLBACK', previewSandbox);
  return {
    nodeEnv,
    databaseUrl: env('DATABASE_URL'),
    localDatabasePath: env('LOCAL_DATABASE_PATH', './data/pgdata'),
    seedDemoData: boolEnv('SEED_DEMO_DATA', nodeEnv !== 'production'),
    showResetLinks: boolEnv('SHOW_RESET_LINKS', nodeEnv !== 'production'),
    appBaseUrl: env('APP_BASE_URL', 'http://localhost:3000'),
    sessionTtlDays: intEnv('SESSION_TTL_DAYS', 7),
    helpEscalationMinutes: intEnv('HELP_ESCALATION_MINUTES', 15),
    cronSecret: env('CRON_SECRET'),
    maxUploadBytes: intEnv('MAX_UPLOAD_BYTES', 5 * 1024 * 1024),
    backupDir: env('BACKUP_DIR', './backups'),
    sessionCookie: {
      secure: cookieSecure,
      sameSite: cookieSameSite,
      partitioned: cookiePartitioned,
    },
    previewSessionFallback,
    supabase: {
      url,
      anonKey,
      serviceRoleKey,
      storageBucket: env('SUPABASE_STORAGE_BUCKET', 'src-private'),
      realtimePrefix: env('SUPABASE_REALTIME_CHANNEL_PREFIX', 'srcpro'),
      authEnabled: boolEnv('SUPABASE_AUTH_ENABLED', false) && Boolean(url && anonKey),
      realtimeEnabled: Boolean(url && anonKey && serviceRoleKey),
    },
    providers: {
      resendApiKey: env('RESEND_API_KEY'),
      notificationFromEmail: env('NOTIFICATION_FROM_EMAIL', BRAND.notificationEmail),
      twilioAccountSid: env('TWILIO_ACCOUNT_SID'),
      twilioAuthToken: env('TWILIO_AUTH_TOKEN'),
      twilioFromNumber: env('TWILIO_FROM_NUMBER'),
      twilioWhatsappFrom: env('TWILIO_WHATSAPP_FROM'),
      vapidPublicKey: env('VAPID_PUBLIC_KEY'),
      vapidPrivateKey: env('VAPID_PRIVATE_KEY'),
      vapidSubject: env('VAPID_SUBJECT', 'mailto:admin@example.org'),
    },
  };
}

export function publicRealtimeConfig(config = getConfig()): { mode: 'supabase' | 'sse'; url?: string; anon_key?: string; channel?: string } {
  if (config.supabase.realtimeEnabled) {
    return { mode: 'supabase', url: config.supabase.url, anon_key: config.supabase.anonKey };
  }
  return { mode: 'sse' };
}
