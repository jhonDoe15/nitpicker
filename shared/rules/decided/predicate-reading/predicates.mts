import { logicTerm } from '../../../near-duplicates/proof/terms.mts';
import { isSideEffectFree } from '../../../logic/purity.mts';
import { term } from '../../../logic/terms.mts';
import {
  calledHelper,
  helperTable,
  isExpressionHelper,
  labelParts,
  type HelperTable,
  type InlinableFunction,
} from '../../../near-duplicates/proof/inline.mts';
import { isBound, nodesOf, present, rebuild } from '../../../near-duplicates/tree/nodes.mts';
import { textOf } from '../../../values/readers.mts';
import { shadowedNames } from './shadowing.mts';
import type { Term } from '../../../logic/typed/term-types.mts';
import type { DecidedUnit, FlowNode, PredicateScope } from '../typed/decided-types.mts';

type Called = { readonly helper: InlinableFunction; readonly rest: readonly FlowNode[] };

const TERM_CONTEXT = {
  locals: { get: (name: string): Term => term('name', name) },
  parameters: new Map(),
  strictEquality: true,
  looseBooleans: false,
  exactIntegers: false,
};

function isPureTree(root: FlowNode): boolean {
  const converted = logicTerm(root, TERM_CONTEXT);
  return converted !== undefined && isSideEffectFree(converted);
}

function hasHelperCall(root: FlowNode, scope: PredicateScope): boolean {
  return nodesOf(root).some((node) => calledHelper(node, scope) !== undefined);
}

function atSite(node: FlowNode, { text, start, end }: FlowNode): FlowNode {
  const copy: { -readonly [Key in keyof FlowNode]: FlowNode[Key] } = { ...node };
  if (text === undefined) {
    delete copy.text;
  } else {
    copy.text = text;
  }
  if (start === undefined) {
    delete copy.start;
  } else {
    copy.start = start;
  }
  if (end === undefined) {
    delete copy.end;
  } else {
    copy.end = end;
  }
  return copy;
}

function substitution({ helper, rest }: Called, site: FlowNode): FlowNode {
  const body = present(present(helper.statements[0]).children[0]);
  const bindings = new Map(helper.parameters.map((name, index) => [name, rest[index]]));
  const inner = rebuild(body, (node: FlowNode, children: FlowNode[]): FlowNode =>
    isBound(node) ? present(bindings.get(node.value)) : { ...node, children, viaHelper: true },
  );
  const { viaHelper: _viaHelper, ...root } = inner;
  return atSite({ ...root, helper: { name: helper.name, text: textOf(body.text) } }, site);
}

function expanded(call: FlowNode, scope: PredicateScope): FlowNode | undefined {
  const callee = present(call.children[0]);
  const found: Called | undefined = scope.shadowed.has(callee.text ?? '')
    ? undefined
    : calledHelper(call, scope);
  return found === undefined ? undefined : substitution(found, call);
}

function replaceCalls(root: FlowNode, scope: PredicateScope): FlowNode {
  return rebuild(root, (node: FlowNode, children: FlowNode[]): FlowNode => {
    const built = { ...node, children };
    return node.kind === 'call' ? (expanded(built, scope) ?? built) : built;
  });
}

function expandedCall(call: FlowNode, scope: PredicateScope): FlowNode | undefined {
  const first = expanded(call, scope);
  if (first === undefined) {
    return undefined;
  }
  const deeper = replaceCalls(first, scope);
  const keeps = !hasHelperCall(deeper, scope) && isPureTree(deeper);
  if (!keeps) {
    return undefined;
  }
  return first.helper === undefined ? deeper : { ...deeper, helper: first.helper };
}

export function withPredicates(
  tree: FlowNode,
  { table, unit }: { readonly table: HelperTable; readonly unit: DecidedUnit },
): FlowNode {
  const scope: PredicateScope = {
    table,
    file: unit.file,
    owner: labelParts(unit.name)?.owner,
    inlined: 0,
    shadowed: shadowedNames(tree),
  };
  return rebuild(tree, (node: FlowNode, children: FlowNode[]): FlowNode => {
    const built = { ...node, children };
    return node.kind === 'call' ? (expandedCall(built, scope) ?? built) : built;
  });
}

export function predicateTable(units: readonly DecidedUnit[]): HelperTable {
  const table: HelperTable = helperTable(units);
  return new Map(
    [...table].filter(([, helper]) => !('ambiguous' in helper) && isExpressionHelper(helper)),
  );
}
