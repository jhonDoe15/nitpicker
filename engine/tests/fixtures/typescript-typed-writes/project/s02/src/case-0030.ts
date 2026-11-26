import { OptimisticLockVersionMismatchError, DataSource, Repository, EntityManager } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next, items, dataSource, other, ds: DataSource, repo2: Repository<any>) { while (true) { try { await orderRepo.save(order); } catch (error) { if (error instanceof OptimisticLockVersionMismatchError) { continue; } } } }
export {};
