import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from './schema.generated';

export type SqlRow = Record<string, unknown>;
export type SqlParams = unknown[];

export interface QueryResult<T extends SqlRow = SqlRow> {
  rows: T[];
  rowCount: number;
}

export interface Database {
  mode: 'pglite' | 'postgres';
  query<T extends SqlRow = SqlRow>(sql: string, params?: SqlParams): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

interface LocalClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: SqlRow[] }>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
}

interface RemoteClient {
  unsafe(sql: string, params?: unknown[]): Promise<ArrayLike<SqlRow> & { count?: number }>;
  end(): Promise<void>;
}

export interface DatabaseConfig {
  databaseUrl?: string;
  localPath?: string;
  inMemory?: boolean;
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return Number(value);
  if (value && typeof value === 'object' && !Array.isArray(value) && 'toISOString' in value) {
    try {
      return String((value as { toISOString: () => string }).toISOString());
    } catch {
      return String(value);
    }
  }
  return value;
}

function normalizeRow(row: SqlRow): SqlRow {
  const result: SqlRow = {};
  for (const [key, value] of Object.entries(row)) result[key] = normalizeValue(value);
  return result;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function rowString(row: SqlRow | undefined, key: string, fallback = ''): string {
  return row && row[key] !== null && row[key] !== undefined ? asString(row[key]) : fallback;
}

export function rowNumber(row: SqlRow | undefined, key: string, fallback = 0): number {
  if (!row || row[key] === null || row[key] === undefined) return fallback;
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function rowBoolean(row: SqlRow | undefined, key: string, fallback = false): boolean {
  if (!row || row[key] === null || row[key] === undefined) return fallback;
  return row[key] === true || row[key] === 1 || row[key] === '1' || row[key] === 't' || row[key] === 'true';
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isPostgresUrl(value: string | undefined): boolean {
  return Boolean(value && /^postgres(ql)?:\/\//i.test(value));
}

export async function createDatabase(config: DatabaseConfig = {}): Promise<Database> {
  const databaseUrl = config.databaseUrl ?? process.env.DATABASE_URL;
  if (isPostgresUrl(databaseUrl)) {
    const postgresModule = await import('postgres');
    const postgres = postgresModule.default as unknown as (url: string, options: Record<string, unknown>) => RemoteClient;
    const client = postgres(databaseUrl as string, {
      ssl: 'require',
      max: 5,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    return {
      mode: 'postgres',
      async query<T extends SqlRow = SqlRow>(sql: string, params: SqlParams = []): Promise<QueryResult<T>> {
        const result = await client.unsafe(sql, params);
        const rows = Array.from(result).map((row) => normalizeRow(row as SqlRow)) as T[];
        return { rows, rowCount: result.count ?? rows.length };
      },
      async exec(sql: string): Promise<void> {
        await client.unsafe(sql);
      },
      async close(): Promise<void> {
        await client.end();
      },
    };
  }

  const { PGlite } = (await import('@electric-sql/pglite')) as unknown as {
    PGlite: new (path?: string) => LocalClient;
  };

  let localPath = config.inMemory ? undefined : config.localPath ?? process.env.LOCAL_DATABASE_PATH ?? './data/pgdata';
  if (localPath?.startsWith('file:')) localPath = localPath.slice(5);
  if (localPath) mkdirSync(path.dirname(localPath), { recursive: true });
  const client = localPath ? new PGlite(localPath) : new PGlite();

  return {
    mode: 'pglite',
    async query<T extends SqlRow = SqlRow>(sql: string, params: SqlParams = []): Promise<QueryResult<T>> {
      const result = await client.query(sql, params);
      const rows = result.rows.map(normalizeRow) as T[];
      return { rows, rowCount: rows.length };
    },
    async exec(sql: string): Promise<void> {
      await client.exec(sql);
    },
    async close(): Promise<void> {
      await client.close();
    },
  };
}

export async function initializeSchema(db: Database): Promise<void> {
  await db.exec(SCHEMA_SQL);
}

export async function countRows(db: Database, table: string): Promise<number> {
  const safeTables = new Set([
    'users',
    'organizations',
    'help_requests',
    'meetings',
    'documents',
    'templates',
    'tasks',
    'reports',
    'briefing_packs',
    'notifications',
  ]);
  if (!safeTables.has(table)) throw new Error(`Unsupported table: ${table}`);
  const result = await db.query<{ count: string | number }>(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return Number(result.rows[0]?.count ?? 0);
}

export function placeholders(values: unknown[], start = 1): string {
  return values.map((_, index) => `$${start + index}`).join(', ');
}
