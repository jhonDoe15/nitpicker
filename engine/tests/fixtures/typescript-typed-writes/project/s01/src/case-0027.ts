import { OptimisticLockVersionMismatchError } from 'typeorm';
import pRetry from 'p-retry';
import retry from 'async-retry';
export async function run(orderRepo, order, id, next) { while (true) { try { await orderRepo.save(order); break; } catch (error) { if (!(error instanceof OptimisticLockVersionMismatchError)) throw error; } } }
export {};
