import { Repository, EntityManager } from 'typeorm';
import { Order } from './store';
import type { Invoice } from './schemas';
declare const orders: Repository<Order>;
declare const invoices: Repository<Invoice>;
declare const manager: EntityManager;
declare function use(value: unknown): void;
declare const loaded: Order[];
declare const base: object;
async function toDto(order: Order) { return { order, customer: await order.customer }; }
function plain(order: Order) { return order.total; }
class Mapper { async toDto(order: Order) { return await order.customer; } }
const mapper = new Mapper();
export async function run() { for (const order of await orders.find()) { use(await mapper.toDto(order)); } }