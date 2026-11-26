import { OptimisticLockVersionMismatchError } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next) { await pRetry(async () => { await order.reload(); order.status = next; return orderRepo.save(order); }, { shouldRetry: (error) => error instanceof OptimisticLockVersionMismatchError }); }
export {};
