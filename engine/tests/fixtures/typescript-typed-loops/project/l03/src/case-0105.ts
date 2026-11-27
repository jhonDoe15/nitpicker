import { Repository } from 'typeorm';
import { Order } from './store';
declare const orders: Repository<Order>;
declare function use(value: unknown): void;
export async function run() {
  const found = await orders.find();
  for (const order of found) {
    use(await order.customer);
  }
}
export async function run2() { const found = await orders.find(); for (const 𝒳 of found) { use(await 𝒳.customer); use('héllo'); } }
export {};
