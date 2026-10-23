import { render } from '../extract/render.mjs';
import { nodesOf } from './canonical.mjs';

function guard(node) {
  return { kind: 'guard', text: render(node.test), loc: node.test.loc ?? node.loc };
}

function completion(node) {
  return { kind: node.kind, text: render(node.value), loc: node.loc };
}

const CLASSIFY = {
  if: guard,
  cond: guard,
  call: (node) => ({ kind: 'effect', text: render(node), loc: node.loc }),
  new: (node) => ({ kind: 'effect', text: render(node), loc: node.loc }),
  set: (node) => ({
    kind: 'state',
    text: `${render(node.object)}.${node.field} = ${render(node.value)}`,
    loc: node.loc,
  }),
  return: completion,
  throw: completion,
  unsupported: (node) => ({ kind: 'unsupported', text: node.syntax, loc: node.loc }),
};

export function semanticItems(model) {
  return Object.keys(model.functions)
    .sort()
    .flatMap((name) =>
      nodesOf(model.functions[name].body)
        .filter((node) => CLASSIFY[node.kind] !== undefined)
        .map((node) => ({ fn: name, ...CLASSIFY[node.kind](node) })),
    );
}

export function statementCounts(model) {
  const statements = Object.values(model.functions).flatMap((fn) => nodesOf(fn.body));
  const kinds = new Set(['bind', 'set', 'eval', 'if', 'return', 'throw', 'try']);
  const modeled = statements.filter(
    (node) => kinds.has(node.kind) && node.loc !== undefined,
  ).length;
  const unsupported = statements.filter((node) => node.kind === 'unsupported').length;
  return { modeled, unsupported };
}
