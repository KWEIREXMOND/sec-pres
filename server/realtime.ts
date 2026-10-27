import type { Notification } from '@/lib/shared-types';
import type { AppConfig } from './config';
import type { Database } from './db';
import { placeholders } from './db';
import { unique } from './utils';

export interface RealtimePayload {
  type: 'notification' | 'refresh' | 'connected';
  notification?: Notification;
  reason?: string;
  at: string;
}

type StreamController = ReadableStreamDefaultController<Uint8Array>;

interface SupabaseChannelLike {
  subscribe(): Promise<unknown> | unknown;
  send(args: unknown): Promise<unknown> | unknown;
}

interface SupabaseClientLike {
  channel(name: string): SupabaseChannelLike;
  removeChannel(channel: SupabaseChannelLike): Promise<unknown> | unknown;
}

export class RealtimeHub {
  private clients = new Map<string, Set<StreamController>>();

  stream(userId: string, request: Request): Response {
    const encoder = new TextEncoder();
    const clients = this.clients;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    let controller: StreamController | undefined;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      const set = clients.get(userId);
      if (controller) set?.delete(controller);
      if (set?.size === 0) clients.delete(userId);
      try {
        controller?.close();
      } catch {
        // Already closed by the runtime.
      }
    };

    const body = new ReadableStream<Uint8Array>({
      start: (activeController) => {
        controller = activeController;
        let set = clients.get(userId);
        if (!set) {
          set = new Set();
          clients.set(userId, set);
        }
        set.add(activeController);
        activeController.enqueue(encoder.encode('retry: 3000\n\n: connected\n\n'));
        activeController.enqueue(
          encoder.encode(`event: connected\ndata: ${JSON.stringify({ type: 'connected', at: new Date().toISOString() })}\n\n`),
        );
        heartbeat = setInterval(() => {
          try {
            activeController.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            cleanup();
          }
        }, 25_000);
        (heartbeat as unknown as { unref?: () => void })?.unref?.();
        request.signal.addEventListener('abort', cleanup, { once: true });
      },
      cancel: cleanup,
    });

    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  broadcast(userId: string, payload: RealtimePayload): void {
    const set = this.clients.get(userId);
    if (!set) return;
    const message = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const controller of Array.from(set)) {
      try {
        controller.enqueue(new TextEncoder().encode(message));
      } catch {
        set.delete(controller);
      }
    }
    if (set.size === 0) this.clients.delete(userId);
  }

  broadcastUsers(userIds: string[], payload: RealtimePayload): void {
    for (const userId of unique(userIds)) this.broadcast(userId, payload);
  }

  connectionCount(): number {
    let total = 0;
    for (const set of this.clients.values()) total += set.size;
    return total;
  }
}

let supabaseClientPromise: Promise<SupabaseClientLike> | null = null;

async function getSupabaseBroadcastClient(config: AppConfig): Promise<SupabaseClientLike | null> {
  if (!config.supabase.realtimeEnabled) return null;
  if (!supabaseClientPromise) {
    supabaseClientPromise = (async () => {
      const module = await import('@supabase/supabase-js');
      const createClient = module.createClient as unknown as (url: string, key: string, options?: Record<string, unknown>) => SupabaseClientLike;
      return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 20 } },
      });
    })();
  }
  return supabaseClientPromise;
}

export async function publishRealtime(
  db: Database,
  hub: RealtimeHub,
  config: AppConfig,
  userIds: string[],
  payload: RealtimePayload,
): Promise<void> {
  const recipients = unique(userIds);
  hub.broadcastUsers(recipients, payload);
  if (!config.supabase.realtimeEnabled || recipients.length === 0) return;

  try {
    const client = await getSupabaseBroadcastClient(config);
    if (!client) return;
    const result = await db.query<{ realtime_token: string }>(
      `SELECT realtime_token FROM sessions
       WHERE user_id IN (${placeholders(recipients)})
         AND revoked_at IS NULL
         AND expires_at > NOW()`,
      recipients,
    );
    await Promise.all(
      result.rows.map(async (row) => {
        const channelName = `${config.supabase.realtimePrefix}:${String(row.realtime_token)}`;
        const channel = client.channel(channelName);
        try {
          await channel.subscribe();
          await channel.send({ type: 'broadcast', event: 'notification', payload });
        } finally {
          await client.removeChannel(channel);
        }
      }),
    );
  } catch (error) {
    console.error('[realtime] Supabase broadcast failed; SSE clients were still notified.', error);
  }
}
