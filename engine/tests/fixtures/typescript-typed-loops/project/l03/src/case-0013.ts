import { Repository, EntityManager } from 'typeorm';
import { Order, Customer, Plain } from './store';
import type { Invoice, Bill } from './schemas';
import { shipments, bills, aliases, records } from './schemas';
import { toDto, second, arrow, exprBody, nested, other, chain, buyerOnly, destr, notAsync, obj, Svc, renamedDto } from './helpers';
import dflt from './helpers';
import * as H from './helpers';
declare const orders: Repository<Order>;
declare const customers: Repository<Customer>;
declare const plains: Repository<Plain>;
declare const invoices: Repository<Invoice>;
declare const anys: Repository<any>;
declare const manager: EntityManager;
declare function use(value: unknown): void;
declare const loaded: Order[];
declare const base: object;
declare const key: string;
declare const svc: Svc;
export async function run() { for (const order of await orders.findAndCountBy({})) { use(await order.customer); } }

export {};
