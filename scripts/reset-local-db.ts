import { rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { getConfig } from '../server/config';
import { createDatabase, initializeSchema } from '../server/db';
import { seedDemoData } from '../server/seed';

const config = getConfig();
if (config.databaseUrl) {
  console.error('Refusing to reset a remote database. Run this only in local PGlite mode.');
  process.exit(1);
}
const localPath = config.localDatabasePath.replace(/^file:/, '');
rmSync(localPath, { recursive: true, force: true });
mkdirSync(path.dirname(localPath), { recursive: true });
const db = await createDatabase({ localPath });
await initializeSchema(db);
await seedDemoData(db, { ...config, seedDemoData: true });
await db.close();
console.log(`Local database reset at ${localPath}.`);
