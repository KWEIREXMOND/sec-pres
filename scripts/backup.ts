import { cpSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getConfig } from '../server/config';

const config = getConfig();
if (config.databaseUrl) {
  console.log('Remote PostgreSQL mode detected. Use pg_dump for backups:');
  console.log('pg_dump "$DATABASE_URL" --no-owner --no-privileges --file=backup.sql');
  process.exit(0);
}
const source = config.localDatabasePath.replace(/^file:/, '');
if (!existsSync(source)) {
  console.error(`No local database found at ${source}. Start the app at least once before backing up.`);
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.join(config.backupDir, `pgdata-${stamp}`);
mkdirSync(path.dirname(destination), { recursive: true });
cpSync(source, destination, { recursive: true });
console.log(`Local database copied to ${destination}`);
