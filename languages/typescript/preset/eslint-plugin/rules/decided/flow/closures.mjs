import { patternNames } from '../facts.mjs';
import { inside, isFunction, outsideFunctions } from '../syntax.mjs';

function declaredNames(node) {
  if (node.type === 'VariableDeclarator') {
    return patternNames(node.id);
  }
  if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
    return [node.id?.name];
  }
  return node.type === 'CatchClause' && node.param !== null ? patternNames(node.param) : [];
}

function declaredIn(fn) {
  const parameters = fn.params.flatMap((param) => patternNames(param));
  return new Set([...parameters, ...[...inside(fn.body)].flatMap(declaredNames)]);
}

function carried(facts, fn, flow) {
  const own = declaredIn(fn);
  return facts.filter(
    (known) =>
      !known.readsMembers &&
      [...known.names].every((name) => !(flow.mutable.has(name) || own.has(name))),
  );
}

/**
 * Remembers, for each function in `expressions`, the facts about names that cannot change and that
 * hold where the function is created.
 */
export function recordCaptures(expressions, facts, flow) {
  for (const expression of expressions) {
    for (const node of outsideFunctions(expression).filter(isFunction)) {
      flow.captured.set(node, carried(facts, node, flow));
    }
  }
}
