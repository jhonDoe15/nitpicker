import { loadOrder, loadPrice, viaHelper, format, saveBatch, OrderService, UserRepository, createOrderStore, pool, Customer } from './store';
declare const ids: string[];
declare function use(value: unknown): void;
declare const parts: string[][];
export async function run() { declare const connection: { send(data: string): void }; for (const id of ids) { connection.send(id); } }