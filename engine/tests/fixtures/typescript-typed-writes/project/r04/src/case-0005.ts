import { sendOrder } from './store';
const pr3 = (await import('p-retry')).default;
export async function run(id: string) { await pr3(() => sendOrder(id)); }