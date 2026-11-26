import { OptimisticLockVersionMismatchError } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next) { await pRetry(async () => { const fresh = await orderRepo.findOneByOrFail({ id }); await orderRepo.save(fresh); }, { shouldRetry: (error) => error instanceof OptimisticLockVersionMismatchError }); }
export {};
