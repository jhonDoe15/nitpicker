import ts from 'typescript';
import { DEFAULT_BOUNDS, traceOf } from '../analyze.mts';
import { ANALYZER_VERSION } from '../extract/extract.mts';
import { functionNamed } from '../model/functions.mts';
import type { Bounds, Contracts, Inputs } from '../model/contract-types.mts';
import type { Analysis, AnalysisResult } from '../model/run-types.mts';
import type { FlowModel, FunctionModel } from '../model/syntax-types.mts';
import { canonicalJson, sha256, withoutLocations } from './canonical.mts';
import { semanticItems } from './items.mts';
import type { SemanticItem } from './items.mts';

export function semanticHash(fn: FunctionModel): string {
  return sha256(canonicalJson(withoutLocations(fn)));
}

export function cacheKey({
  model,
  contracts,
  inputs = {},
  bounds = {},
  version = ANALYZER_VERSION,
}: {
  model: FlowModel;
  contracts: Contracts;
  inputs?: Inputs;
  bounds?: Partial<Bounds> | undefined;
  version?: string;
}): string {
  const functions = Object.keys(model.functions)
    .sort()
    .map((name) => [name, semanticHash(functionNamed(model, name))]);
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

function multisetDifference<T>(
  left: readonly T[],
  right: readonly T[],
  keyOf: (item: T) => string,
): T[] {
  const remaining = new Map<string, number>();
  for (const item of right) {
    remaining.set(keyOf(item), (remaining.get(keyOf(item)) ?? 0) + 1);
  }
  return left.filter((item) => {
    const count = remaining.get(keyOf(item)) ?? 0;
    remaining.set(keyOf(item), count - 1);
    return count <= 0;
  });
}

function located(item: SemanticItem): {
  fn: string;
  kind: string;
  text: string;
  line: number;
  column: number;
} {
  return {
    fn: item.fn,
    kind: item.kind,
    text: item.text,
    line: item.loc?.line ?? 0,
    column: item.loc?.column ?? 0,
  };
}

function outcomesOf(result: AnalysisResult): string[] {
  return result.paths.map((path) => `${traceOf(path)} ${path.value}`);
}

function setDifference(left: readonly string[], right: readonly string[]): string[] {
  const other = new Set(right);
  return [...new Set(left)].filter((item) => !other.has(item)).sort();
}

function itemKey(item: SemanticItem): string {
  return `${item.fn}|${item.kind}|${item.text}`;
}

function hashOf(model: FlowModel, name: string): string {
  const fn = Object.hasOwn(model.functions, name) ? model.functions[name] : undefined;
  return fn === undefined ? 'absent' : semanticHash(fn);
}

export function flowDiff(base: Analysis, head: Analysis) {
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
