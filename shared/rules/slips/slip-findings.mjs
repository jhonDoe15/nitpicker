import { RULE_IDS } from '../../policy.mjs';
import { identityCounter, reuseFinding } from '../reuse/reuse-finding.mjs';
import { resultRangeSlips } from './result-range.mjs';

function unitFindings(unit, analyzerName) {
  const numbered = identityCounter();
  return resultRangeSlips(unit.tree, unit.file).map(({ node, subject, fix }) => {
    const base = `${unit.file}#${unit.name}:${node.text ?? String(node.start)}`;
    return reuseFinding(analyzerName, {
      key: 'resultSlip',
      path: unit.file,
      identity: numbered(`result-slip:${base}`),
      symbol: unit.name,
      line: node.start,
      values: { subject, fix },
    });
  });
}

export function resultSlipFindings(units, { analyzerName, isExcepted }) {
  return units
    .filter((unit) => unit.tree?.kind === 'function')
    .filter((unit) => !isExcepted(RULE_IDS.resultSlip, unit.file))
    .flatMap((unit) => unitFindings(unit, analyzerName));
}
