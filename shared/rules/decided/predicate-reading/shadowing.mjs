import { nodesOf } from '../../../near-duplicates/tree/nodes.mjs';
import { declaredNames } from '../flow/stability.mjs';

const LOCAL_FUNCTION =
  /^function_declaration:.*?\bfun\s+(?:<[^>]*>\s*)?(?:[\w$.<>?]+\.)?(?<name>[\w$]+)\s*\(/su;

/**
 * The names `tree` declares itself: parameters, locals, loop variables and local functions. A call
 * of such a name reaches that declaration, never a function or library call of the same name.
 */
export function shadowedNames(tree) {
  const functions = nodesOf(tree)
    .filter((node) => node.kind === 'statement' && typeof node.value === 'string')
    .map((node) => LOCAL_FUNCTION.exec(node.value)?.groups.name)
    .filter((name) => name !== undefined);
  return new Set([...declaredNames(tree), ...functions]);
}
