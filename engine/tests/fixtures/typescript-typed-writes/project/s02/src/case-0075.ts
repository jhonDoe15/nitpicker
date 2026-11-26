import { OptimisticLockVersionMismatchError, DataSource, Repository, EntityManager } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next, items, dataSource, other, ds: DataSource, repo2: Repository<any>) { await pRetry(async () => { await orderRepo.save(order); items.map(async (i) => { await orderRepo.save(next); }); }, { shouldRetry: (error) => error instanceof OptimisticLockVersionMismatchError }); }
export {};
