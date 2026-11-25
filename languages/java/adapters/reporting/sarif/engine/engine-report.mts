import { existsSync } from 'node:fs';
import type { SarifLog } from '../../../jpa/jpa-types.mts';

type Reports = {
  readonly own: string;
  readonly engine: string;
  readonly merge: (own: SarifLog, engine: SarifLog) => SarifLog;
};

export function firstDifference(orders: readonly number[]): number {
  return orders.find((order) => order !== 0) ?? 0;
}

export function withEngineReport(
  { own, engine, merge }: Reports,
  read: (file: string) => SarifLog,
): SarifLog {
  const report = read(own);
  return existsSync(engine) ? merge(report, read(engine)) : report;
}
