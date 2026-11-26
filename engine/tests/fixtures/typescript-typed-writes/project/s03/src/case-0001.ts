import { OptimisticLockVersionMismatchError, Repository, EntityManager, DataSource } from 'typeorm';
import pRetry from 'p-retry';
import { retry, handleType } from 'cockatiel';
class Order {} declare const orderRepo: Repository<Order>; declare const dataSource: DataSource; declare const loadOrder: () => Promise<Order>;
export async function run(order: Order, id: number, next: string, items: Order[], flag: boolean) { await pRetry(async () => { type order = number; await orderRepo.save(order); }, { shouldRetry: (error: unknown) => error instanceof OptimisticLockVersionMismatchError }); }