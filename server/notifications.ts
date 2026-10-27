import type { Notification, NotificationPreferences } from '@/lib/shared-types';
import type { Database, SqlRow } from './db';
import { publishRealtime } from './realtime';
import type { Runtime } from './runtime';
import { providerAvailability, sendBrowserPush, sendEmail, sendSms, sendWhatsapp, type ProviderResult } from './providers';
import { addMinutes, id, nowIso } from './utils';

type NotificationCategory = 'general' | 'meeting' | 'task' | 'help';
type ExternalChannel = 'email' | 'sms' | 'whatsapp' | 'push';

export interface NotifyInput {
  userIds: string[];
  organizationId?: string | null;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  severity?: Notification['severity'];
  dedupeKey?: string | null;
  category?: NotificationCategory;
  reason?: string;
}

interface UserContactRow extends SqlRow {
  id: string;
  email: string;
  phone: string;
  whatsapp_number: string | null;
}

function mapNotification(row: SqlRow): Notification {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    organization_id: row.organization_id ? String(row.organization_id) : null,
    type: String(row.type),
    title: String(row.title),
    body: String(row.body),
    link: row.link ? String(row.link) : null,
    severity: String(row.severity) as Notification['severity'],
    is_read: Boolean(row.is_read),
    read_at: row.read_at ? String(row.read_at) : null,
    dedupe_key: row.dedupe_key ? String(row.dedupe_key) : null,
    created_at: String(row.created_at),
  };
}

export function notificationFromRow(row: SqlRow): Notification {
  return mapNotification(row);
}

async function getPreferences(db: Database, userId: string): Promise<NotificationPreferences> {
  const result = await db.query<SqlRow>('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
  const row = result.rows[0] || {};
  return {
    in_app: row.in_app !== false,
    email: row.email !== false,
    sms: Boolean(row.sms),
    whatsapp: Boolean(row.whatsapp),
    push: row.push !== false,
    meeting_reminders: row.meeting_reminders !== false,
    task_reminders: row.task_reminders !== false,
    help_alerts: row.help_alerts !== false,
  };
}

function categoryAllowed(prefs: NotificationPreferences, category: NotificationCategory): boolean {
  if (category === 'meeting') return prefs.meeting_reminders;
  if (category === 'task') return prefs.task_reminders;
  if (category === 'help') return prefs.help_alerts;
  return true;
}

function enabledChannels(prefs: NotificationPreferences): ExternalChannel[] {
  const channels: ExternalChannel[] = [];
  if (prefs.email) channels.push('email');
  if (prefs.sms) channels.push('sms');
  if (prefs.whatsapp) channels.push('whatsapp');
  if (prefs.push) channels.push('push');
  return channels;
}

async function getContact(db: Database, userId: string): Promise<UserContactRow | null> {
  const result = await db.query<UserContactRow>(
    'SELECT id, email, phone, whatsapp_number FROM users WHERE id = $1 AND is_active = TRUE',
    [userId],
  );
  return result.rows[0] ?? null;
}

function notificationUrl(runtime: Runtime, notification: Notification): string {
  const base = runtime.config.appBaseUrl.replace(/\/$/, '');
  return notification.link ? `${base}${notification.link}` : `${base}/workspace/notifications`;
}

async function dispatchChannel(
  runtime: Runtime,
  channel: ExternalChannel,
  contact: UserContactRow,
  notification: Notification,
): Promise<ProviderResult> {
  const url = notificationUrl(runtime, notification);
  const shortBody = `${notification.body}\n\nOpen: ${url}`.slice(0, 1400);
  switch (channel) {
    case 'email':
      return sendEmail(runtime.config, String(contact.email), notification.title, shortBody);
    case 'sms':
      return sendSms(runtime.config, String(contact.phone), `${notification.title}: ${notification.body}`.slice(0, 300));
    case 'whatsapp':
      return sendWhatsapp(runtime.config, String(contact.whatsapp_number || contact.phone), shortBody.slice(0, 900));
    case 'push':
      return sendBrowserPush(runtime.db, runtime.config, String(contact.id), {
        title: notification.title,
        body: notification.body,
        url: notification.link || '/workspace/notifications',
        tag: notification.type,
      });
  }
}

function recipientFor(channel: ExternalChannel, contact: UserContactRow): string {
  if (channel === 'email') return String(contact.email || '');
  if (channel === 'whatsapp') return String(contact.whatsapp_number || contact.phone || '');
  if (channel === 'sms') return String(contact.phone || '');
  return String(contact.id);
}

async function upsertDelivery(
  db: Database,
  notificationId: string,
  channel: ExternalChannel,
  contact: UserContactRow,
  result: ProviderResult,
  previousAttempts = 0,
): Promise<void> {
  const attempts = previousAttempts + 1;
  const status = !result.configured ? 'not_configured' : result.ok ? 'sent' : attempts >= 3 ? 'failed' : 'pending';
  const nextRetryAt = result.configured && !result.ok && attempts < 3 ? addMinutes(new Date(), attempts * 5).toISOString() : null;
  const existing = await db.query<{ id: string }>(
    'SELECT id FROM notification_deliveries WHERE notification_id = $1 AND channel = $2',
    [notificationId, channel],
  );
  const existingId = existing.rows[0]?.id;
  if (existingId) {
    await db.query(
      `UPDATE notification_deliveries
       SET provider = $2, status = $3, recipient = $4, attempts = $5,
           provider_message_id = $6, last_error = $7, sent_at = $8::timestamptz,
           next_retry_at = $9::timestamptz
       WHERE id = $1`,
      [
        existingId,
        result.provider,
        status,
        recipientFor(channel, contact) || result.recipient,
        attempts,
        result.providerMessageId ?? null,
        result.error ?? null,
        result.ok ? nowIso() : null,
        nextRetryAt,
      ],
    );
    return;
  }
  await db.query(
    `INSERT INTO notification_deliveries
      (id, notification_id, user_id, channel, provider, status, recipient, attempts,
       provider_message_id, last_error, sent_at, next_retry_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::timestamptz, NOW())
     ON CONFLICT DO NOTHING`,
    [
      id('delivery'),
      notificationId,
      String(contact.id),
      channel,
      result.provider,
      status,
      recipientFor(channel, contact) || result.recipient,
      attempts,
      result.providerMessageId ?? null,
      result.error ?? null,
      result.ok ? nowIso() : null,
      nextRetryAt,
    ],
  );
}

async function recordInAppDelivery(db: Database, notification: Notification): Promise<void> {
  await db.query(
    `INSERT INTO notification_deliveries
      (id, notification_id, user_id, channel, provider, status, recipient, attempts,
       provider_message_id, last_error, sent_at, next_retry_at, created_at)
     VALUES ($1, $2, $3, 'in_app', 'database+realtime', 'delivered', $3, 1,
             NULL, NULL, NOW(), NULL, NOW())
     ON CONFLICT DO NOTHING`,
    [id('delivery'), notification.id, notification.user_id],
  );
}

export async function notifyUsers(runtime: Runtime, input: NotifyInput): Promise<Notification[]> {
  const created: Notification[] = [];
  const userIds = Array.from(new Set(input.userIds)).filter(Boolean);
  for (const userId of userIds) {
    const prefs = await getPreferences(runtime.db, userId);
    if (!prefs.in_app || !categoryAllowed(prefs, input.category || 'general')) continue;
    const dedupeKey = input.dedupeKey ? `${input.dedupeKey}:${userId}` : null;
    const result = await runtime.db.query<SqlRow>(
      `INSERT INTO notifications
        (id, user_id, organization_id, type, title, body, link, severity, is_read, read_at, dedupe_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, NULL, $9, NOW())
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        id('notification'),
        userId,
        input.organizationId ?? null,
        input.type,
        input.title,
        input.body,
        input.link ?? null,
        input.severity ?? 'info',
        dedupeKey,
      ],
    );
    const row = result.rows[0];
    if (!row) continue;
    const notification = mapNotification(row);
    created.push(notification);
    await recordInAppDelivery(runtime.db, notification);
    await publishRealtime(runtime.db, runtime.hub, runtime.config, [userId], {
      type: 'notification',
      notification,
      reason: input.reason,
      at: nowIso(),
    });

    const contact = await getContact(runtime.db, userId);
    if (!contact) continue;
    for (const channel of enabledChannels(prefs)) {
      const delivery = await dispatchChannel(runtime, channel, contact, notification);
      await upsertDelivery(runtime.db, notification.id, channel, contact, delivery);
    }
  }
  return created;
}

export async function retryPendingDeliveries(runtime: Runtime, limit = 40): Promise<number> {
  const result = await runtime.db.query<SqlRow>(
    `SELECT d.id AS delivery_id, d.channel, d.attempts, n.*
     FROM notification_deliveries d
     JOIN notifications n ON n.id = d.notification_id
     WHERE d.status IN ('pending', 'failed')
       AND d.attempts < 3
       AND (d.next_retry_at IS NULL OR d.next_retry_at <= NOW())
     ORDER BY COALESCE(d.next_retry_at, d.created_at)
     LIMIT $1`,
    [limit],
  );
  let attempted = 0;
  for (const row of result.rows) {
    const channel = String(row.channel) as ExternalChannel;
    if (!['email', 'sms', 'whatsapp', 'push'].includes(channel)) continue;
    const notification: Notification = {
      id: String(row.id || row.notification_id),
      user_id: String(row.user_id),
      organization_id: row.organization_id ? String(row.organization_id) : null,
      type: String(row.type),
      title: String(row.title),
      body: String(row.body),
      link: row.link ? String(row.link) : null,
      severity: String(row.severity) as Notification['severity'],
      is_read: Boolean(row.is_read),
      read_at: row.read_at ? String(row.read_at) : null,
      dedupe_key: row.dedupe_key ? String(row.dedupe_key) : null,
      created_at: String(row.created_at),
    };
    const contact = await getContact(runtime.db, notification.user_id);
    if (!contact) continue;
    const delivery = await dispatchChannel(runtime, channel, contact, notification);
    await upsertDelivery(runtime.db, notification.id, channel, contact, delivery, Number(row.attempts || 0));
    attempted += 1;
  }
  return attempted;
}

export async function unreadNotificationCount(db: Database, userId: string): Promise<number> {
  const result = await db.query<{ count: number | string }>(
    'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId],
  );
  return Number(result.rows[0]?.count || 0);
}

export async function unreadMessageCount(db: Database, userId: string): Promise<number> {
  const result = await db.query<{ count: number | string }>(
    'SELECT COUNT(*)::int AS count FROM messages WHERE recipient_id = $1 AND read_at IS NULL',
    [userId],
  );
  return Number(result.rows[0]?.count || 0);
}

export async function getProviderStatus(runtime: Runtime): Promise<Array<{ channel: string; configured: boolean }>> {
  return [
    { channel: 'in_app', configured: true },
    ...providerAvailability(runtime.config),
  ];
}
