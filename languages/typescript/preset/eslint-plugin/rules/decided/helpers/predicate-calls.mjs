import { isSideEffectFree } from '../../../../../../../shared/logic/purity.mjs';
import { foldTerm } from '../../../../../../../shared/logic/terms.mjs';
import { inside } from '../syntax.mjs';

const FUNCTION_VALUES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const MODULE_SCOPES = new Set(['module', 'global']);

function rangeKeyOf(range) {
  return `${String(range[0])}:${String(range[1])}`;
}

function variableAt(scope, name) {
  for (let current = scope; current !== null; current = current.upper) {
    const found = current.set.get(name);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function functionOf(variable) {
  const [definition] = variable.defs;
  const isOnly = variable.defs.length === 1 && MODULE_SCOPES.has(variable.scope.type);
  if (!isOnly) {
    return undefined;
  }
  if (definition.type === 'FunctionName') {
    return definition.node;
  }
  const init = definition.node.init;
  const isConst = definition.type === 'Variable' && definition.parent?.kind === 'const';
  return isConst && FUNCTION_VALUES.has(init?.type) ? init : undefined;
}

function returnedExpression(fn) {
  if (fn.async || fn.generator || fn.body === null || fn.body === undefined) {
    return undefined;
  }
  if (fn.body.type !== 'BlockStatement') {
    return fn.body;
  }
  const [only, ...rest] = fn.body.body;
  return rest.length === 0 && only?.type === 'ReturnStatement'
    ? (only.argument ?? undefined)
    : undefined;
}

function parameterNames(fn) {
  const names = fn.params.map((param) => (param.type === 'Identifier' ? param.name : undefined));
  return names.every((name) => name !== undefined) && new Set(names).size === names.length
    ? names
    : undefined;
}

function readsOnlyKnown(fn, { sourceCode, site }) {
  const scope = sourceCode.scopeManager.acquire(fn);
  return (
    scope !== null &&
    scope.through.every(
      (reference) =>
        reference.resolved === null ||
        variableAt(site, reference.identifier.name) === reference.resolved,
    )
  );
}

function helperOf(call, context) {
  const { sourceCode, site } = context;
  if (call.callee.type !== 'Identifier' || call.optional) {
    return undefined;
  }
  const variable = variableAt(sourceCode.getScope(call), call.callee.name);
  const fn = variable === undefined ? undefined : functionOf(variable);
  const body = fn === undefined ? undefined : returnedExpression(fn);
  const names = fn === undefined ? undefined : parameterNames(fn);
  const isClosed =
    body !== undefined &&
    names !== undefined &&
    names.length === call.arguments.length &&
    readsOnlyKnown(fn, { sourceCode, site });
  return isClosed ? { name: call.callee.name, params: names, body } : undefined;
}

function substituted(body, params, args) {
  const bindings = new Map(params.map((name, index) => [name, args[index]]));
  return foldTerm(body, (node, children) =>
    node.kind === 'name' && bindings.has(node.value)
      ? bindings.get(node.value)
      : { ...node, children },
  );
}

function hasNamedAtom(root) {
  return foldTerm(
    root,
    (node, children) =>
      (node.kind === 'name' && node.value.startsWith('#')) || children.some(Boolean),
  );
}

function innerExpansions(helper, context) {
  const calls = [...inside(helper.body)].filter((node) => node.type === 'CallExpression');
  return calls.flatMap((call) => {
    const inner = helperOf(call, context);
    return inner === undefined ? [] : [[call, inner]];
  });
}

function withInner(helper, context) {
  const inners = innerExpansions(helper, context);
  const byRange = new Map(inners.map(([call, inner]) => [rangeKeyOf(call.range), inner]));
  const body = context.build(helper.body);
  return foldTerm(body, (node, children) => {
    const inner =
      node.kind === 'call' && node.range !== undefined
        ? byRange.get(rangeKeyOf(node.range))
        : undefined;
    if (inner === undefined) {
      return { ...node, children };
    }
    return {
      ...substituted(context.build(inner.body), inner.params, children.slice(1)),
      range: node.range,
      helper: { name: inner.name, text: context.sourceCode.getText(inner.body) },
    };
  });
}

function expandedCall(call, node, context) {
  const helper = helperOf(call, context);
  if (helper === undefined) {
    return undefined;
  }
  const body = withInner(helper, context);
  if (hasNamedAtom(body)) {
    return undefined;
  }
  const term = substituted(body, helper.params, node.children.slice(1));
  const text = context.sourceCode.getText(helper.body);
  return isSideEffectFree(term) && node.children.slice(1).every((arg) => isSideEffectFree(arg))
    ? { ...term, range: node.range, helper: { name: helper.name, text } }
    : undefined;
}

/**
 * `term` (built from `root`) with each call of a same-file module function that only returns a
 * side-effect-free expression replaced by that expression, its parameters bound to the arguments,
 * through at most 2 levels. `build` turns a syntax node into a term of the same kind as `term`.
 */
export function withPredicateCalls(term, root, { sourceCode, build }) {
  const calls = new Map(
    [...inside(root)]
      .filter((node) => node.type === 'CallExpression')
      .map((node) => [rangeKeyOf(node.range), node]),
  );
  if (calls.size === 0) {
    return term;
  }
  return foldTerm(term, (node, children) => {
    const call =
      node.kind === 'call' && node.range !== undefined
        ? calls.get(rangeKeyOf(node.range))
        : undefined;
    const rebuilt = { ...node, children };
    if (call === undefined) {
      return rebuilt;
    }
    const context = { sourceCode, build, site: sourceCode.getScope(call) };
    return expandedCall(call, rebuilt, context) ?? rebuilt;
  });
}
