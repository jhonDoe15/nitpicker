import { Repository } from 'typeorm';
import { Order } from './store';
declare const orders: Repository<Order>;
declare function use(value: unknown): void;
const found = await orders.find();
for (const order of found) { use(await order.customer); }
found.map(async (order) => use(await order.lines));
export {};
