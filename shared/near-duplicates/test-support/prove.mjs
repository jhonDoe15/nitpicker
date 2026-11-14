import { compareText } from '../tree/keys.mjs';
import { prepareUnit, proveUnits } from '../engine.mjs';
import { javascriptUnits } from './javascript.mjs';

export function proveSource(source, options) {
  const [left, right] = javascriptUnits(source, options).map((unit) => prepareUnit(unit));
  return proveUnits([left, right]);
}

export function verdictOf(source, options) {
  return proveSource(source, options)?.verdict;
}

function label(node) {
  return node.text ?? node.value ?? node.kind;
}

export function holeSummary(finding) {
  return finding.parameters.map(({ kind, deferred, a, b }) => ({
    kind,
    deferred,
    values: [label(a), label(b)].toSorted(compareText),
  }));
}
