import { shipments } from './schemas';
export async function run() { for (const shipment of await shipments.find()) { await shipment.carrier; } }