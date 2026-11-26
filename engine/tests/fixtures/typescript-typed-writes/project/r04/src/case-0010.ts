import * as c from 'cockatiel';
import { sendOrder } from './store';
const pol = c.retry(c.handleAll(), {});
export async function run(id: string) { await pol.execute(() => sendOrder(id)); }