import { nodesOf } from '../../../near-duplicates/tree/nodes.mts';
import { declaredNames } from '../flow/stability.mts';
import type { FlowNode } from '../typed/decided-types.mts';

const LOCAL_FUNCTION =
  /^function_declaration:.*?\bfun\s+(?:<[^>]*>\s*)?(?:[\w$.<>?]+\.)?(?<name>[\w$]+)\s*\(/su;

export function shadowedNames(tree: FlowNode): Set<string> {
  const functions = nodesOf(tree)
    .filter((node) => node.kind === 'statement' && typeof node.value === 'string')
    .map((node) => LOCAL_FUNCTION.exec(node.value ?? '')?.groups?.['name'])
    .filter((name) => name !== undefined);
  return new Set([...declaredNames(tree), ...functions]);
}
