import { OptimisticLockVersionMismatchError } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next) { const fresh = await orderRepo.findOneByOrFail({ id }); await orderRepo.save(fresh); }
export {};
