import { OptimisticLockVersionMismatchError, DataSource, Repository, EntityManager } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next, items, dataSource, other, ds: DataSource, repo2: Repository<any>) { await pRetry(async () => { const fresh = await orderRepo.findOneBy({ id }); await orderRepo.save(next, fresh); }, { shouldRetry: (error) => error instanceof OptimisticLockVersionMismatchError }); }
export {};
