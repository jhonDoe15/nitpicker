import { OptimisticLockVersionMismatchError, DataSource, Repository, EntityManager } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next, items, dataSource, other, ds: DataSource, repo2: Repository<any>) { const f = () => orderRepo.save(order); await pRetry(f, { shouldRetry: (error) => error instanceof OptimisticLockVersionMismatchError }); }
export {};
