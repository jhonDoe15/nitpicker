import { patternNames } from '../facts.mjs';
import { inside, isFunction, outsideFunctions } from '../syntax.mjs';

function declaredIn(fn) {
  const names = new Set(fn.params.flatMap((param) => patternNames(param)));
  for (const node of inside(fn.body)) {
    if (node.type === 'VariableDeclarator') {
      patternNames(node.id).forEach((name) => names.add(name));
    } else if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      names.add(node.id?.name);
    } else if (node.type === 'CatchClause' && node.param !== null) {
      patternNames(node.param).forEach((name) => names.add(name));
    }
  }
  return names;
}

function carried(facts, fn, flow) {
  const own = declaredIn(fn);
  return facts.filter(
    (known) =>
      !known.readsMembers &&
      [...known.names].every((name) => !flow.mutable.has(name) && !own.has(name)),
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
