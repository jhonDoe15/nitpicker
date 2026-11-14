import { RULE_IDS } from '../../../policy.mjs';
import { identityCounter, reuseFinding } from '../../reuse/reuse-finding.mjs';
import { decidedConditions } from '../decided.mjs';
import { modelledUnit, sharedTables } from '../decided-conditions.mjs';

const SLIP_FILE = /\.(?:java|kt|go)$/u;

function unitFindings(unit, analyzerName, shared) {
  const slips = decidedConditions(modelledUnit(unit, shared), {
    slipsOnly: true,
    kotlin: unit.file.endsWith('.kt'),
    go: unit.file.endsWith('.go'),
    remainders: !unit.file.endsWith('.java'),
    defined: shared.defined,
    unitName: unit.name,
  });
  const numbered = identityCounter();
  return slips.map(({ node, subject, fix }) => {
    const base = `${unit.file}#${unit.name}:${node.text ?? String(node.start)}`;
    return reuseFinding(analyzerName, {
      key: 'integerSlip',
      path: unit.file,
      identity: numbered(`integer-slip:${base}`),
      symbol: unit.name,
      line: node.start,
      values: { subject, fix },
    });
  });
}

export function integerSlipFindings(units, { analyzerName, isExcepted }) {
  const shared = sharedTables(units);
  return units
    .filter((unit) => unit.tree?.kind === 'function' && SLIP_FILE.test(unit.file))
    .filter((unit) => !isExcepted(RULE_IDS.integerSlip, unit.file))
    .flatMap((unit) => unitFindings(unit, analyzerName, shared));
}
