import { OptimisticLockVersionMismatchError } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next) { const OPTS = { shouldRetry: (error) => error instanceof OptimisticLockVersionMismatchError };
await pRetry(() => orderRepo.save(order), OPTS); }
export {};
