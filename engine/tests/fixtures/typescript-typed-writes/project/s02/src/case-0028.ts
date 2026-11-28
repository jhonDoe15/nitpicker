import { OptimisticLockVersionMismatchError, DataSource, Repository, EntityManager } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next, items, dataSource, other, ds: DataSource, repo2: Repository<any>) { for (let attempt = 0; attempt < 3; attempt += 1) { try { await orderRepo.save(order); order = await orderRepo.findOneBy({ id }); return; } catch (error) { if (!(error instanceof OptimisticLockVersionMismatchError)) { throw error; } } } }
export {};
