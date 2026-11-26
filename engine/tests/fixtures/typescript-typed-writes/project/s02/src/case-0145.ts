import { Repository } from 'other-orm';
import pRetry from 'p-retry';
export async function run(orderRepo: Repository<any>, order) { await pRetry(() => orderRepo.save(order), { shouldRetry: (e) => e.name === 'OptimisticLockVersionMismatchError' }); }
export {};
