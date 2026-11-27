import { loadOrder, loadPrice, viaHelper, format, saveBatch, OrderService, UserRepository, createOrderStore, pool, Customer } from './store';
declare const ids: string[];
declare function use(value: unknown): void;
declare const parts: string[][];
export async function run() { for (let i = 0; i < ids.length; i += 100) { await saveBatch(ids.slice(i, i + 100)); } }