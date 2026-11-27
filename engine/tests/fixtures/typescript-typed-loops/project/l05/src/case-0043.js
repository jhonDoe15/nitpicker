import { loadOrder } from './store';
export async function run(ids) { for (const id of ids) { await loadOrder(id); } }