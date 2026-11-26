const typeorm = require('typeorm');
const pRetry = require('p-retry');
export async function run(orderRepo, order) { await pRetry(() => orderRepo.save(order), { shouldRetry: (e) => e instanceof typeorm.OptimisticLockVersionMismatchError }); }
export {};
