import { isIntegerType } from '../../../near-duplicates/proof/terms.mts';
import { nodesOf, present } from '../../../near-duplicates/tree/nodes.mts';
import { writtenNames } from '../facts.mts';
import { isIntegerLoop } from '../flow/loops.mts';
import type { FlowNode } from '../typed/decided-types.mts';

const DECLARING = new Set(['parameter', 'declare', 'foreach']);

function declaredName(node: FlowNode): string[] {
  const value = present(node.children[1]).value;
  return value === undefined ? [] : [value];
}

export function integerNames(tree: FlowNode): Set<string> {
  const declared = nodesOf(tree).filter(
    (node) => DECLARING.has(node.kind) && node.children[1]?.kind === 'name',
  );
  const other = new Set(
    declared
      .filter((node) => !(isIntegerType(node.children[0]) || isIntegerLoop(node)))
      .flatMap(declaredName),
  );
  return new Set(declared.flatMap(declaredName).filter((name) => !other.has(name)));
}

export function parametersOf(tree: FlowNode): Set<string> {
  const nodes = nodesOf(tree);
  const reassigned = new Set(
    nodes.filter(({ kind }) => kind === 'assign' || kind === 'update').flatMap(writtenNames),
  );
  return new Set(
    nodes
      .filter((node) => node.kind === 'parameter' && node.children[1]?.kind === 'name')
      .flatMap(declaredName)
      .filter((name) => !reassigned.has(name)),
  );
}
