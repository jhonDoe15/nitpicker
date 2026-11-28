import { OptimisticLockVersionMismatchError, DataSource, Repository, EntityManager } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next, items, dataSource, other, ds: DataSource, repo2: Repository<any>) { const O2 = { shouldRetry: (error) => error instanceof OptimisticLockVersionMismatchError }; const OPTS = O2; await pRetry(() => orderRepo.save(order), OPTS); }
export {};
