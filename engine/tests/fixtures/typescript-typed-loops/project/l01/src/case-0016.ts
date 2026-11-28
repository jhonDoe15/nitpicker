import { Repository, EntityManager } from 'typeorm';
import { Order } from './store';
import type { Invoice } from './schemas';
declare const orders: Repository<Order>;
declare const invoices: Repository<Invoice>;
declare const manager: EntityManager;
declare function use(value: unknown): void;
declare const loaded: Order[];
declare const base: object;
export async function run() { const found = await orders.find({ relations: ['customer'] }); for (const order of found) { const { customer } = order; use(await customer); } }