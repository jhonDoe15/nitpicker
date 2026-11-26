import pRetry from 'p-retry';
const E = 'OptimisticLockVersionMismatchError';
export async function run(orderRepo, order) { await pRetry(() => orderRepo.save(order), { shouldRetry: (e) => e.name === E }); }
export {};
