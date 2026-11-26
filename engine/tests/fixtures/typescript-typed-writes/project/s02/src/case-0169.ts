import { retry, handleType } from 'cockatiel';
import { OptimisticLockVersionMismatchError } from 'typeorm';
const policy = retry(handleType(OptimisticLockVersionMismatchError)).x.y();
export async function run(orderRepo, order) { await policy.execute(() => orderRepo.save(order)); }
export {};
