import { OptimisticLockVersionMismatchError } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next) { await pRetry(async () => { const current = await orderRepo.findOneByOrFail({ id }); log(current); return orderRepo.save(order); }, { shouldRetry: (error) => error instanceof OptimisticLockVersionMismatchError }); }
export {};
