import { exponential } from 'exponential-backoff';
import { backOff } from 'exponential-backoff';
import { OptimisticLockVersionMismatchError } from 'typeorm';
export async function run(orderRepo, order) { await backOff(() => orderRepo.save(order), { retry: (e) => e instanceof OptimisticLockVersionMismatchError }); }
export {};
