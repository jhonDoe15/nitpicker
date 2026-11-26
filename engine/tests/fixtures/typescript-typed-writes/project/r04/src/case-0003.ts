import { sendOrder } from './store';
export async function run(id: string) { const pr = (await import('p-retry')).default; await pr(() => sendOrder(id)); }