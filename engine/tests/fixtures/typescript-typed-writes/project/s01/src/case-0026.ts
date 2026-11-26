import { OptimisticLockVersionMismatchError } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next) { const loaded = await orderRepo.findOneByOrFail({ id }); loaded.status = next; for (let attempt = 0; attempt < 3; attempt += 1) { try { await orderRepo.save(loaded); return; } catch (error) { if (!(error instanceof OptimisticLockVersionMismatchError)) { throw error; } } } }
export {};
