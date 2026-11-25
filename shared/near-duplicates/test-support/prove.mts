import { compareText } from '../tree/keys.mts';
import { prepareUnit, proveUnits } from '../engine.mts';
import type { NearFinding } from '../engine.mts';
import { present } from '../tree/nodes.mts';
import type { TreeNode } from '../tree/tree-types.mts';
import { javascriptUnits } from './javascript.mts';

type SourceOptions = { readonly file?: string; readonly commutes?: true };

export function proveSource(source: string, options?: SourceOptions): NearFinding | undefined {
  const [left, right] = javascriptUnits(source, options).map((unit) => prepareUnit(unit));
  return proveUnits([present(left), present(right)]);
}

export function provedSource(source: string, options?: SourceOptions): NearFinding {
  return present(proveSource(source, options));
}

export function verdictOf(source: string, options?: SourceOptions): string | undefined {
  return proveSource(source, options)?.verdict;
}

function label(node: TreeNode): string {
  return node.text ?? node.value ?? node.kind;
}

export function holeSummary(finding: NearFinding): {
  kind: string;
  deferred: boolean;
  values: string[];
}[] {
  return finding.parameters.map(({ kind, deferred, a, b }) => ({
    kind,
    deferred,
    values: [label(a), label(b)].toSorted(compareText),
  }));
}
