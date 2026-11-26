import { sendOrder } from './store';
const { default: pr2 } = await import('p-retry');
export async function run(id: string) { await pr2(() => sendOrder(id)); }