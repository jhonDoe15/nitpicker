import { retry, handleType } from 'cockatiel';
import { OptimisticLockVersionMismatchError } from 'typeorm';
const policy = retry(handleType(OptimisticLockVersionMismatchError), { maxAttempts: 3 });
export async function run(orderRepo, order) { await policy.execute(() => orderRepo.save(order)); }
export {};
