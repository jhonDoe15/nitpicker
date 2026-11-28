import { shipments } from './schemas';
export async function run() { const found = await shipments.find(); for (const s of found) { const { carrier } = s; await carrier; } }
export {};
