import type { AppConfig } from './config';
import type { Database } from './db';

export interface ProviderResult {
  ok: boolean;
  configured: boolean;
  provider: string;
  recipient: string;
  providerMessageId?: string | null;
  error?: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

function configurationMissing(result: Omit<ProviderResult, 'ok' | 'configured'>): ProviderResult {
  return { ok: false, configured: false, error: 'Provider is not configured.', ...result };
}

export async function sendEmail(
  config: AppConfig,
  recipient: string,
  subject: string,
  body: string,
): Promise<ProviderResult> {
  const base = { provider: 'resend', recipient };
  if (!config.providers.resendApiKey || !recipient) {
    return configurationMissing({ ...base, error: !recipient ? 'No email address is registered.' : 'Email provider is not configured.' });
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.providers.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.providers.notificationFromEmail,
        to: [recipient],
        subject,
        text: body,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const raw = await response.text();
    let parsed: { id?: string; message?: string } = {};
    try {
      parsed = raw ? (JSON.parse(raw) as typeof parsed) : {};
    } catch {
      parsed = { message: raw };
    }
    if (!response.ok) {
      return { ...base, ok: false, configured: true, error: parsed.message || `Email provider returned ${response.status}.` };
    }
    return { ...base, ok: true, configured: true, providerMessageId: parsed.id ?? null };
  } catch (error) {
    return { ...base, ok: false, configured: true, error: error instanceof Error ? error.message : 'Email delivery failed.' };
  }
}

async function sendTwilio(
  config: AppConfig,
  channel: 'sms' | 'whatsapp',
  recipient: string,
  body: string,
): Promise<ProviderResult> {
  const provider = channel === 'sms' ? 'twilio-sms' : 'twilio-whatsapp';
  const base = { provider, recipient };
  const sid = config.providers.twilioAccountSid;
  const authToken = config.providers.twilioAuthToken;
  const from = channel === 'sms' ? config.providers.twilioFromNumber : config.providers.twilioWhatsappFrom;
  const to = channel === 'whatsapp' ? `whatsapp:${recipient}` : recipient;
  if (!sid || !authToken || !from || !recipient) {
    return configurationMissing({
      ...base,
      error: !recipient ? 'No telephone number is registered.' : `${provider} is not fully configured.`,
    });
  }
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
      signal: AbortSignal.timeout(8000),
    });
    const raw = await response.text();
    let parsed: { sid?: string; message?: string } = {};
    try {
      parsed = raw ? (JSON.parse(raw) as typeof parsed) : {};
    } catch {
      parsed = { message: raw };
    }
    if (!response.ok) {
      return { ...base, ok: false, configured: true, error: parsed.message || `Messaging provider returned ${response.status}.` };
    }
    return { ...base, ok: true, configured: true, providerMessageId: parsed.sid ?? null };
  } catch (error) {
    return { ...base, ok: false, configured: true, error: error instanceof Error ? error.message : 'Messaging delivery failed.' };
  }
}

export function sendSms(config: AppConfig, recipient: string, body: string): Promise<ProviderResult> {
  return sendTwilio(config, 'sms', recipient, body);
}

export function sendWhatsapp(config: AppConfig, recipient: string, body: string): Promise<ProviderResult> {
  return sendTwilio(config, 'whatsapp', recipient, body);
}

interface WebPushModule {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options?: Record<string, unknown>,
  ): Promise<{ statusCode?: number }>;
}

export async function sendBrowserPush(
  db: Database,
  config: AppConfig,
  userId: string,
  payload: PushPayload,
): Promise<ProviderResult> {
  const base = { provider: 'web-push', recipient: userId };
  const { vapidPublicKey, vapidPrivateKey, vapidSubject } = config.providers;
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return configurationMissing({ ...base, error: 'Browser push keys are not configured.' });
  }
  const subscriptions = await db.query<{ endpoint: string; p256dh: string; auth_key: string }>(
    'SELECT endpoint, p256dh, auth_key FROM push_subscriptions WHERE user_id = $1',
    [userId],
  );
  if (subscriptions.rows.length === 0) {
    return { ...base, ok: false, configured: true, error: 'No browser push subscription is registered for this user.' };
  }
  try {
    const module = (await import('web-push')) as unknown as { default?: WebPushModule } & WebPushModule;
    const webpush = module.default ?? module;
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const results = await Promise.allSettled(
      subscriptions.rows.map((row) =>
        webpush.sendNotification(
          {
            endpoint: String(row.endpoint),
            keys: { p256dh: String(row.p256dh), auth: String(row.auth_key) },
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: payload.url || '/workspace/dashboard',
            tag: payload.tag || 'src-secretariat-update',
          }),
          { TTL: 3600 },
        ),
      ),
    );
    const successes = results.filter((result) => result.status === 'fulfilled');
    if (successes.length === 0) {
      const first = results.find((result) => result.status === 'rejected');
      const message = first && first.status === 'rejected' ? String(first.reason) : 'All browser push attempts failed.';
      return { ...base, ok: false, configured: true, error: message.slice(0, 500) };
    }
    return { ...base, ok: true, configured: true, providerMessageId: `${successes.length}/${subscriptions.rows.length}` };
  } catch (error) {
    return { ...base, ok: false, configured: true, error: error instanceof Error ? error.message : 'Browser push failed.' };
  }
}

export function providerAvailability(config: AppConfig): Array<{ channel: string; configured: boolean }> {
  const p = config.providers;
  return [
    { channel: 'email', configured: Boolean(p.resendApiKey) },
    { channel: 'sms', configured: Boolean(p.twilioAccountSid && p.twilioAuthToken && p.twilioFromNumber) },
    { channel: 'whatsapp', configured: Boolean(p.twilioAccountSid && p.twilioAuthToken && p.twilioWhatsappFrom) },
    { channel: 'push', configured: Boolean(p.vapidPublicKey && p.vapidPrivateKey && p.vapidSubject) },
    { channel: 'realtime', configured: config.supabase.realtimeEnabled },
  ];
}
