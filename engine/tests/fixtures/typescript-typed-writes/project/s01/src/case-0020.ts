import { OptimisticLockVersionMismatchError } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next) { await dataSource.transaction(async (m) => { await pRetry(() => m.save(order), { shouldRetry: (error) => error instanceof OptimisticLockVersionMismatchError }); }); }
export {};
