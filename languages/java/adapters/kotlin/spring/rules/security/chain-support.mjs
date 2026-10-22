import { walk } from '../../syntax/kotlin-calls.mjs';
import { descendants, kid, kids, textOf } from '../../syntax/kotlin-tree.mjs';

const QUALIFIED = new Set(['DOT_QUALIFIED_EXPRESSION', 'SAFE_ACCESS_EXPRESSION']);

export function terminalCall(source, node) {
  const call = QUALIFIED.has(node?.t) ? kids(node).at(-1) : node;
  if (call?.t !== 'CALL_EXPRESSION') {
    return undefined;
  }
  const callee = kids(call)[0];
  return {
    name: callee?.t === 'REFERENCE_EXPRESSION' ? textOf(source, callee) : '',
    arguments: [
      ...kids(kid(call, 'VALUE_ARGUMENT_LIST'), 'VALUE_ARGUMENT'),
      ...kids(call, 'LAMBDA_ARGUMENT'),
    ].map((argument) => kids(argument)[0]),
  };
}

function rootOf(source, body, ancestors, node) {
  const statement = body.t === 'BLOCK' ? (ancestors[1] ?? node) : body;
  const first = descendants(statement, (child) => child.t === 'REFERENCE_EXPRESSION')[0];
  return textOf(source, first);
}

export function rootedNodes(file, declaration) {
  const body = declaration.body;
  return walk(body).map(({ node, ancestors }) => ({
    node,
    ancestors,
    root: rootOf(file.source, body, ancestors, node),
  }));
}
