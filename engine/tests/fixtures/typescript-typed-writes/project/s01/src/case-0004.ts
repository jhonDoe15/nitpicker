import { OptimisticLockVersionMismatchError } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next) { await pRetry(async () => { const row = await orderRepo.findOneByOrFail({ id }); return orderRepo.save(apply(row, next)); }, { shouldRetry: (error) => error instanceof OptimisticLockVersionMismatchError }); }
export {};
