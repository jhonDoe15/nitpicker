import { RULE_IDS } from '../../../policy.mjs';
import { reuseFinding } from '../../reuse/reuse-finding.mjs';
import { decidedConditions } from '../decided.mjs';
import { predicateTable, withPredicates } from '../helpers/predicates.mjs';
import { getterTable, gettersOfFile } from '../models/getters.mjs';
import { modelledTree } from '../models/annotate.mjs';
import { declaredTypes } from '../models/types.mjs';
import { typedTree } from '../widths/typed-tree.mjs';

const JVM_FILE = /\.(?:java|kt)$/u;

function typedUnit(unit, shared) {
  const scope = {
    types: declaredTypes(unit.tree),
    getters: gettersOfFile(shared.getters, unit.file),
    owner: /^(?<owner>[\w$]+)\./u.exec(unit.name)?.groups.owner,
    python: false,
    kotlin: unit.file.endsWith('.kt'),
  };
  const withHelpers = withPredicates(unit.tree, { table: shared.helpers, unit });
  return typedTree(modelledTree(withHelpers, scope), scope);
}

function unitFindings(unit, analyzerName, shared) {
  const seen = new Map();
  const slips = decidedConditions(typedUnit(unit, shared), {
    slipsOnly: true,
    kotlin: unit.file.endsWith('.kt'),
    unitName: unit.name,
  });
  return slips.map(({ node, subject, fix }) => {
    const base = `${unit.file}#${unit.name}:${node.text ?? String(node.start)}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return reuseFinding(analyzerName, {
      key: 'integerSlip',
      path: unit.file,
      identity: `integer-slip:${base}#${String(count)}`,
      symbol: unit.name,
      line: node.start,
      values: { subject, fix },
    });
  });
}

export function integerSlipFindings(units, { analyzerName, isExcepted }) {
  const shared = { getters: getterTable(units), helpers: predicateTable(units) };
  return units
    .filter((unit) => unit.tree?.kind === 'function' && JVM_FILE.test(unit.file))
    .filter((unit) => !isExcepted(RULE_IDS.integerSlip, unit.file))
    .flatMap((unit) => unitFindings(unit, analyzerName, shared));
}
