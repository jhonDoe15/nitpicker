import { retry as retryPolicy, handleType } from 'cockatiel';
import { OptimisticLockVersionMismatchError } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
const policy = retryPolicy(handleType(OptimisticLockVersionMismatchError), { maxAttempts: 3 });
export async function run(orderRepo, order) { await policy.execute(() => orderRepo.save(order)); }
export {};
