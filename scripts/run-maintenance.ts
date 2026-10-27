import { getRuntime } from '../server/runtime';
import { runMaintenance } from '../server/maintenance';

const runtime = await getRuntime();
const summary = await runMaintenance(runtime, 'cli');
console.log(JSON.stringify(summary, null, 2));
await runtime.db.close();
