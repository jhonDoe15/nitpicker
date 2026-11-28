import type { Viewer } from './store';
declare const viewer: Viewer;
import { loadOrder, loadPrice, viaHelper, format, saveBatch, OrderService, UserRepository, createOrderStore, pool, Customer } from './store';
declare const ids: string[];
declare function use(value: unknown): void;
export async function run() { for (const id of ids) { viewer.update(id); } }