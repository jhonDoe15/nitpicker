import { default as pRetry } from 'p-retry';
import { sendOrder } from './store';
export async function run(id: string) { await pRetry(() => sendOrder(id)); }