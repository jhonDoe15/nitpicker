import { retry, handleType } from 'cockatiel';
import { OptimisticLockVersionMismatchError } from 'typeorm';
const base = retry(handleType(OptimisticLockVersionMismatchError), { maxAttempts: 3 });
const policy = base;
export async function run(orderRepo, order) { await policy.execute(() => orderRepo.save(order)); }
export {};
