import { getConfig } from '../server/config';
import { createDatabase, initializeSchema } from '../server/db';
import { seedDemoData } from '../server/seed';

const config = getConfig();
const db = await createDatabase({ databaseUrl: config.databaseUrl, localPath: config.localDatabasePath });
await initializeSchema(db);
await seedDemoData(db, { ...config, seedDemoData: true });
await db.close();
console.log('Demonstration data is ready.');
