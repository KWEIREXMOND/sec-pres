import { getConfig, type AppConfig } from './config';
import { createDatabase, initializeSchema, type Database, type DatabaseConfig } from './db';
import { RealtimeHub } from './realtime';
import { seedDemoData } from './seed';

export interface Runtime {
  db: Database;
  hub: RealtimeHub;
  config: AppConfig;
}

let runtimePromise: Promise<Runtime> | null = null;

async function buildRuntime(dbConfig: DatabaseConfig, config: AppConfig, seed: boolean): Promise<Runtime> {
  const db = await createDatabase(dbConfig);
  await initializeSchema(db);
  if (seed) await seedDemoData(db, config);
  return { db, hub: new RealtimeHub(), config };
}

export function getRuntime(): Promise<Runtime> {
  if (!runtimePromise) {
    const config = getConfig();
    runtimePromise = buildRuntime(
      { databaseUrl: config.databaseUrl, localPath: config.localDatabasePath },
      config,
      config.seedDemoData,
    ).catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

export function setRuntime(runtime: Runtime | Promise<Runtime>): void {
  runtimePromise = Promise.resolve(runtime);
}

export async function resetRuntime(): Promise<void> {
  const current = runtimePromise;
  runtimePromise = null;
  if (current) {
    try {
      const runtime = await current;
      await runtime.db.close();
    } catch {
      // Ignore initialization failures during reset.
    }
  }
}

export async function createTestRuntime(options: { seed?: boolean; config?: Partial<AppConfig> } = {}): Promise<Runtime> {
  const base = getConfig();
  const config: AppConfig = {
    ...base,
    ...options.config,
    seedDemoData: options.seed ?? false,
    showResetLinks: options.config?.showResetLinks ?? true,
    supabase: { ...base.supabase, ...(options.config?.supabase ?? {}), authEnabled: false, realtimeEnabled: false },
    providers: { ...base.providers, ...(options.config?.providers ?? {}) },
  };
  return buildRuntime({ inMemory: true }, config, config.seedDemoData);
}
