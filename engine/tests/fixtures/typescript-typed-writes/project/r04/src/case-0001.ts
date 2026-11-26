import { backOff as retryIt } from 'exponential-backoff';
import { sendOrder } from './store';
export async function run(id: string) { await retryIt(() => sendOrder(id)); }