import type pRetry from 'p-retry';
import { sendOrder } from './store';
export async function run(id: string, f: typeof pRetry) { await f(() => sendOrder(id)); }