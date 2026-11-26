import { retry, handleType, IPolicy } from 'cockatiel';
import { OptimisticLockVersionMismatchError } from 'typeorm';
export async function run(orderRepo, order, policy: IPolicy) { await policy.execute(() => orderRepo.save(order)); }
const e = OptimisticLockVersionMismatchError;
export {};
