import { Repository } from 'typeorm';
declare const repo: Repository<{ id: string }>;
import { loadOrder, loadPrice, viaHelper, format, saveBatch, OrderService, UserRepository, createOrderStore, pool, Customer } from './store';
declare const ids: string[];
declare function use(value: unknown): void;
declare const parts: string[][];
export async function run() { const entities = ids.map((id) => repo.create({ id })); void entities; }