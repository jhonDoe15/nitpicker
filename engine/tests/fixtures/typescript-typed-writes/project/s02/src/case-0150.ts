const { a = 1 } = require('typeorm');
import pRetry from 'p-retry';
export async function run(orderRepo, order) { await pRetry(() => orderRepo.save(order), { shouldRetry: (e) => e.name === 'OptimisticLockVersionMismatchError' }); }
export {};
