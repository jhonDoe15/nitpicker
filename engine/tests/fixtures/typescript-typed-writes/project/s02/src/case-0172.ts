import { wrap, retry } from 'cockatiel';
import { OptimisticLockVersionMismatchError } from 'typeorm';
const a = retry(OptimisticLockVersionMismatchError);
const policy = wrap(a, a);
export async function run(orderRepo, order) { await policy.execute(() => orderRepo.save(order)); }
export {};
