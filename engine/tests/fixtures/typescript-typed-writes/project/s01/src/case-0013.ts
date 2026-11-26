import { OptimisticLockVersionMismatchError } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next) { for (let attempt = 0; attempt < 3; attempt += 1) { try { const row = await orderRepo.findOneByOrFail({ id }); row.status = next; await orderRepo.save(row); return; } catch (error) { if (!(error instanceof OptimisticLockVersionMismatchError)) { throw error; } } } }
export {};
