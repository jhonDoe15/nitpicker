import { logicTerm } from '../../../near-duplicates/proof/terms.mjs';
import { isSideEffectFree } from '../../../logic/purity.mjs';
import { term } from '../../../logic/terms.mjs';
import {
  calledHelper,
  helperTable,
  isExpressionHelper,
  labelParts,
} from '../../../near-duplicates/proof/inline.mjs';
import { isBound, nodesOf, rebuild } from '../../../near-duplicates/tree/nodes.mjs';
import { shadowedNames } from './shadowing.mjs';

const TERM_CONTEXT = {
  locals: { get: (name) => term('name', name) },
  parameters: new Map(),
  strictEquality: true,
};

function isPureTree(root) {
  const converted = logicTerm(root, TERM_CONTEXT);
  return converted !== undefined && isSideEffectFree(converted);
}

function hasHelperCall(root, scope) {
  return nodesOf(root).some((node) => calledHelper(node, scope) !== undefined);
}

function substitution({ helper, rest }, site) {
  const body = helper.statements[0].children[0];
  const bindings = new Map(helper.parameters.map((name, index) => [name, rest[index]]));
  const inner = rebuild(body, (node, children) =>
    isBound(node) ? bindings.get(node.value) : { ...node, children, viaHelper: true },
  );
  return {
    ...inner,
    text: site.text,
    start: site.start,
    end: site.end,
    viaHelper: false,
    helper: { name: helper.name, text: body.text },
  };
}

function expanded(call, scope) {
  const found = scope.shadowed.has(call.children[0].text) ? undefined : calledHelper(call, scope);
  return found === undefined ? undefined : substitution(found, call);
}

function replaceCalls(root, scope) {
  return rebuild(root, (node, children) => {
    const built = { ...node, children };
    return node.kind === 'call' ? (expanded(built, scope) ?? built) : built;
  });
}

function expandedCall(call, scope) {
  const first = expanded(call, scope);
  if (first === undefined) {
    return undefined;
  }
  const deeper = replaceCalls(first, scope);
  const keeps = !hasHelperCall(deeper, scope) && isPureTree(deeper);
  return keeps ? { ...deeper, helper: first.helper } : undefined;
}

/**
 * `tree` with each call of a same-file helper that cannot be overridden and only returns a
 * side-effect-free condition replaced by that condition, its parameters bound to the arguments,
 * through at most 2 levels. The replaced node keeps the call's text and names the helper; the
 * nodes inside it are marked `viaHelper`.
 */
export function withPredicates(tree, { table, unit }) {
  const scope = {
    table,
    file: unit.file,
    owner: labelParts(unit.name)?.owner,
    inlined: 0,
    shadowed: shadowedNames(tree),
  };
  return rebuild(tree, (node, children) => {
    const built = { ...node, children };
    return node.kind === 'call' ? (expandedCall(built, scope) ?? built) : built;
  });
}

export function predicateTable(units) {
  return new Map(
    [...helperTable(units)].filter(([, helper]) => !helper.ambiguous && isExpressionHelper(helper)),
  );
}
