import typeorm = require('typeorm');
import pRetry from 'p-retry';
export async function run(orderRepo, order) { await pRetry(() => orderRepo.save(order), { shouldRetry: (e) => e instanceof typeorm.OptimisticLockVersionMismatchError }); }
export {};
