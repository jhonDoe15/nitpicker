import { OptimisticLockVersionMismatchError, DataSource, Repository, EntityManager } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next, items, dataSource, other, ds: DataSource, repo2: Repository<any>) { await pRetry(async () => { let fresh = await orderRepo.findOneByOrFail({ id }); fresh = merge(fresh); await orderRepo.save(fresh); }, { shouldRetry: (error) => error instanceof OptimisticLockVersionMismatchError }); }
export {};
