import pRetry from 'p-retry';
import { retry, handleAll, type RetryPolicy } from 'cockatiel';
import { sendOrder, readOrder, Sender } from './store';
import { policy } from './policies';
export async function run(id: string, n: number, items: string[], flag: boolean) { for (const a of items) { try { switch (a) { case "x": await sendOrder(id); break; } } catch {} } }