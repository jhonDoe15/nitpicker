import { retry } from 'cockatiel';
import { OptimisticLockVersionMismatchError } from 'typeorm';
function build() { return retry(OptimisticLockVersionMismatchError); }
const policy = build();
export async function run(orderRepo, order) { await policy.execute(() => orderRepo.save(order)); }
export {};
