import * as ar from 'async-retry';
import { sendOrder } from './store';
export async function run(id: string) { await ar(() => sendOrder(id)); }