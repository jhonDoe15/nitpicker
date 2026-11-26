import { OptimisticLockVersionMismatchError, DataSource, Repository, EntityManager } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next, items, dataSource, other, ds: DataSource, repo2: Repository<any>) { const COND = OptimisticLockVersionMismatchError; for (;;) { try { await orderRepo.save(order); break; } catch (error) { log(error); } }  }
export {};
