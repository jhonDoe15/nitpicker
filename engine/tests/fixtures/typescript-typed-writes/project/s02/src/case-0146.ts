import type { DataSource } from 'typeorm-like';
import pRetry from 'p-retry';
export async function run(orderRepo, order) { for (;;) { try { await orderRepo.save(order); break; } catch (e) { if (e.name === 'OptimisticLockVersionMismatchError') {} } } }
export {};
