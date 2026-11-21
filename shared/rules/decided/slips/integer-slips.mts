import { RULE_IDS } from '../../../policy.mts';
import { slipReports } from '../../slips/slip-reports.mts';
import { decidedConditions } from '../decided.mts';
import { modelledUnit, sharedTables } from '../decided-conditions.mts';
import type { Finding } from '../../../values/findings.mts';
import type { DecidedUnit, RuleContext, SharedTables } from '../typed/decided-types.mts';

const SLIP_FILE = /\.(?:java|kt|go)$/u;

function unitFindings(unit: DecidedUnit, analyzerName: string, shared: SharedTables): Finding[] {
  const slips = decidedConditions(modelledUnit(unit, shared), {
    slipsOnly: true,
    looseBooleans: false,
    unbounded: false,
    references: false,
    kotlin: unit.file.endsWith('.kt'),
    go: unit.file.endsWith('.go'),
    remainders: !unit.file.endsWith('.java'),
    defined: shared.defined,
    unitName: unit.name,
  });
  return slipReports(unit, slips, { analyzerName, key: 'integerSlip', prefix: 'integer-slip' });
}

export function integerSlipFindings(
  units: readonly DecidedUnit[],
  { analyzerName, isExcepted }: RuleContext,
): Finding[] {
  const shared = sharedTables(units);
  return units
    .filter((unit) => unit.tree.kind === 'function' && SLIP_FILE.test(unit.file))
    .filter((unit) => !isExcepted(RULE_IDS.integerSlip, unit.file))
    .flatMap((unit) => unitFindings(unit, analyzerName, shared));
}
