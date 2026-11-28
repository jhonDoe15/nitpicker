import { Repository, EntityManager } from 'typeorm';
import { Order } from './store';
import type { Invoice } from './schemas';
declare const orders: Repository<Order>;
declare const invoices: Repository<Invoice>;
declare const manager: EntityManager;
declare function use(value: unknown): void;
declare const loaded: Order[];
declare const base: object;
export async function run() { for (const order of loaded) { use(await order.customer); } }