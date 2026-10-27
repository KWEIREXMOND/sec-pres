import { getConfig } from '../server/config';
import { createDatabase, initializeSchema } from '../server/db';

const config = getConfig();
const db = await createDatabase({ databaseUrl: config.databaseUrl, localPath: config.localDatabasePath });
await initializeSchema(db);
await db.close();
console.log(`Schema applied in ${db.mode} mode.`);
