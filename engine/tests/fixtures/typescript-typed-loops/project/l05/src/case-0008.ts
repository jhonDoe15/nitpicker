import { Repository } from 'typeorm';
declare const repo: Repository<{ id: string }>;
import { loadOrder, loadPrice, viaHelper, format, saveBatch, OrderService, UserRepository, createOrderStore, pool, Customer } from './store';
declare const ids: string[];
declare function use(value: unknown): void;
export async function run() { for (const id of ids) { entities.push(repo.create({ id })); } }