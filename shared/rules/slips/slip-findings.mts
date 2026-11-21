import { RULE_IDS } from '../../policy.mts';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';
import type { Finding } from '../../values/findings.mts';
import { resultRangeSlips } from './result-range.mts';
import { slipReports } from './slip-reports.mts';

type SlipUnit = {
  readonly file: string;
  readonly name: string;
  readonly tree?: TreeNode | undefined;
};

function unitFindings(unit: SlipUnit, analyzerName: string): Finding[] {
  if (unit.tree === undefined) {
    return [];
  }
  return slipReports(unit, resultRangeSlips(unit.tree, unit.file), {
    analyzerName,
    key: 'resultSlip',
    prefix: 'result-slip',
  });
}

export function resultSlipFindings(
  units: readonly SlipUnit[],
  {
    analyzerName,
    isExcepted,
  }: { analyzerName: string; isExcepted: (rule: string, file: string) => boolean },
): Finding[] {
  return units
    .filter((unit) => unit.tree?.kind === 'function')
    .filter((unit) => !isExcepted(RULE_IDS.resultSlip, unit.file))
    .flatMap((unit) => unitFindings(unit, analyzerName));
}
