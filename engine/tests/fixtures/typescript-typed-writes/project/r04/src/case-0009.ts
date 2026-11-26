import { retry as make, handleAll } from 'cockatiel';
import { sendOrder } from './store';
export async function run(id: string) { await make(handleAll(), {}).execute(() => sendOrder(id)); }