import { retry, handleType, RetryPolicy } from 'cockatiel';
import { OptimisticLockVersionMismatchError } from 'typeorm';
export async function run(orderRepo, order, policy: RetryPolicy) { await policy.execute(() => { const k = OptimisticLockVersionMismatchError; return orderRepo.save(order); }); }
export {};
