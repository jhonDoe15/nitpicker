import ts from 'typescript';
import { DEFAULT_BOUNDS, traceOf } from '../analyze.mjs';
import { ANALYZER_VERSION } from '../extract/extract.mjs';
import { canonicalJson, sha256, withoutLocations } from './canonical.mjs';
import { semanticItems } from './items.mjs';

export function semanticHash(fn) {
  return sha256(canonicalJson(withoutLocations(fn)));
}

export function cacheKey({
  model,
  contracts,
  inputs = {},
  bounds = {},
  version = ANALYZER_VERSION,
}) {
  const functions = Object.keys(model.functions)
    .sort()
    .map((name) => [name, semanticHash(model.functions[name])]);
  const material = {
    version,
    typescript: ts.version,
    file: model.file,
    entry: model.entry,
    anchors: sha256(canonicalJson(model.functions)),
    functions,
    missingHelpers: model.missingHelpers,
    contracts,
    inputs,
    bounds: { ...DEFAULT_BOUNDS, ...bounds },
  };
  return sha256(canonicalJson(material));
}

function multisetDifference(left, right, keyOf) {
  const remaining = new Map();
  for (const item of right) {
    remaining.set(keyOf(item), (remaining.get(keyOf(item)) ?? 0) + 1);
  }
  return left.filter((item) => {
    const count = remaining.get(keyOf(item)) ?? 0;
    remaining.set(keyOf(item), count - 1);
    return count <= 0;
  });
}

function located(item) {
  return {
    fn: item.fn,
    kind: item.kind,
    text: item.text,
    line: item.loc?.line ?? 0,
    column: item.loc?.column ?? 0,
  };
}

function outcomesOf(result) {
  return result.paths.map((path) => `${traceOf(path)} ${path.value}`);
}

function setDifference(left, right) {
  const other = new Set(right);
  return [...new Set(left)].filter((item) => !other.has(item)).sort();
}

function itemKey(item) {
  return `${item.fn}|${item.kind}|${item.text}`;
}

function hashOf(model, name) {
  return Object.hasOwn(model.functions, name) ? semanticHash(model.functions[name]) : 'absent';
}

export function flowDiff(base, head) {
  const baseItems = semanticItems(base.model);
  const headItems = semanticItems(head.model);
  const names = [
    ...new Set([...Object.keys(base.model.functions), ...Object.keys(head.model.functions)]),
  ].sort();
  const baseViolations = base.result.violations.map((violation) => violation.signature);
  const headViolations = head.result.violations.map((violation) => violation.signature);
  return {
    status: { base: base.result.status, head: head.result.status },
    changedFunctions: names.filter((name) => hashOf(base.model, name) !== hashOf(head.model, name)),
    removed: multisetDifference(baseItems, headItems, itemKey).map(located),
    added: multisetDifference(headItems, baseItems, itemKey).map(located),
    violations: {
      removed: setDifference(baseViolations, headViolations),
      added: setDifference(headViolations, baseViolations),
    },
    outcomes: {
      removed: setDifference(outcomesOf(base.result), outcomesOf(head.result)),
      added: setDifference(outcomesOf(head.result), outcomesOf(base.result)),
    },
  };
}
