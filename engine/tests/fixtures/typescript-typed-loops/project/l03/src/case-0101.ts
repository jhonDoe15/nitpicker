import { Repository } from 'typeorm';
import { Order } from './store';
declare const orders: Repository<Order>;
declare function use(value: unknown): void;
export class K { async m() { const found = await orders.find(); for (const order of found) { use(await order.customer); } } }
export const o = { async m() { const found = await orders.find(); found.forEach(async (order) => use(await order.customer)); } };
export {};
