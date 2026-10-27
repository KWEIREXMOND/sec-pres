import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { ZodSchema } from 'zod';
import { getConfig, type SessionCookieConfig } from './config';

const scrypt = promisify(scryptCallback);

export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export function id(prefix = ''): string {
  const value = randomUUID();
  return prefix ? `${prefix}_${value}` : value;
}

export function token(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [salt, hex] = stored.split(':');
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const derived = (await scrypt(password, salt, expected.length || 64)) as Buffer;
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addDays(date: Date | string, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function addMinutes(date: Date | string, minutes: number): Date {
  return new Date(new Date(date).getTime() + minutes * 60_000);
}

export function addHours(date: Date | string, hours: number): Date {
  return addMinutes(date, hours * 60);
}

export function toDateInput(date: Date | string): string {
  const value = new Date(date);
  return value.toISOString().slice(0, 10);
}

export function toDateTimeLocal(date: Date | string): string {
  const value = new Date(date);
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function fromDateInput(value: string, fallback = new Date()): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function startOfDay(date: Date | string): Date {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

export function endOfDay(date: Date | string): Date {
  const value = new Date(date);
  value.setUTCHours(23, 59, 59, 999);
  return value;
}

export function makeReference(prefix: string, date = new Date()): string {
  const stamp = toDateInput(date).replaceAll('-', '');
  return `${prefix}-${stamp}-${randomBytes(2).toString('hex').toUpperCase()}`;
}

export function safeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function oneLine(value: unknown, max = 180): string {
  return safeText(value).replace(/\s+/g, ' ').slice(0, max);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function parseCookies(header: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

function sessionCookieAttributes(options: SessionCookieConfig = getConfig().sessionCookie): string {
  const sameSite = options.sameSite === 'none' ? 'None' : options.sameSite === 'strict' ? 'Strict' : 'Lax';
  const partitioned = options.partitioned && sameSite === 'None';
  const secure = options.secure || sameSite === 'None' || partitioned ? '; Secure' : '';
  return `${secure}; SameSite=${sameSite}${partitioned ? '; Partitioned' : ''}`;
}

export function sessionCookie(value: string, maxAgeSeconds: number, options?: SessionCookieConfig): string {
  return `srcpro_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Max-Age=${maxAgeSeconds}${sessionCookieAttributes(options)}`;
}

export function clearSessionCookie(options?: SessionCookieConfig): string {
  return `srcpro_session=; Path=/; HttpOnly; Max-Age=0${sessionCookieAttributes(options)}`;
}

export function getIpAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '').slice(0, 100);
}

export function getUserAgent(request: Request): string {
  return (request.headers.get('user-agent') || '').slice(0, 300);
}

export function withSecurityHeaders(response: Response): Response {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Cache-Control', response.headers.get('Cache-Control') || 'no-store');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return withSecurityHeaders(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
    }),
  );
}

export function apiError(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.message, details: error.details ?? null }, error.status);
  }
  console.error('[api] Unhandled error', error);
  return json({ error: 'The request could not be completed. Please try again.' }, 500);
}

export async function readJson<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, 'A valid JSON request body is required.');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HttpError(400, 'Please correct the highlighted form values.', result.error.flatten());
  }
  return result.data;
}

export async function readOptionalJson<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  return readJson(request, schema);
}

export function formToObject(form: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function digitsOnly(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export function whatsappUrl(phone: string, message?: string): string {
  const number = digitsOnly(phone);
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${number}${text}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`;
}

export function smsUrl(phone: string, body?: string): string {
  const separator = body ? `?&body=${encodeURIComponent(body)}` : '';
  return `sms:${phone.replace(/[^+\d]/g, '')}${separator}`;
}

export function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180) || 'attachment';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function boolParam(value: string | null): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

export function toTitle(value: string): string {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
