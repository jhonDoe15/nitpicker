import { isIntegerType } from '../../../../near-duplicates/proof/terms.mts';
import { fact } from '../../facts.mts';
import { isPlainLiteral } from '../arms/arms.mts';
import { sourceOf, valueEqualOf } from '../exits.mts';
import type { Fact, Flow, FlowNode, FlowScope } from '../../typed/decided-types.mts';

type Assignment = { readonly target: FlowNode | undefined; readonly value: FlowNode | undefined };

const EXACT_TYPES = new Set(['String', 'boolean', 'Boolean', 'char', 'Character', 'Char']);

function assignmentOf(node: FlowNode): Assignment | undefined {
  if (node.kind === 'declare') {
    const [, target, value] = node.children;
    return { target, value };
  }
  const assign = node.kind === 'evaluate' ? node.children[0] : undefined;
  if (assign?.kind === 'assign' && assign.value === '=') {
    const [target, value] = assign.children;
    return { target, value };
  }
  return undefined;
}

function isExactType(name: FlowNode, scope: FlowScope): boolean {
  const text = name.value === undefined ? undefined : scope.types.get(name.value);
  return (
    text !== undefined &&
    (EXACT_TYPES.has(text) || isIntegerType({ kind: 'type', value: text, children: [] }))
  );
}

function isCopy(target: FlowNode, value: FlowNode, scope: FlowScope): boolean {
  return (
    value.kind === 'name' &&
    value.binding === 'bound' &&
    value.value !== target.value &&
    isExactType(target, scope) &&
    isExactType(value, scope)
  );
}

export function assignedFacts(node: FlowNode, flow: Flow): Fact[] {
  const found = assignmentOf(node);
  const { target, value } = found ?? { target: undefined, value: undefined };
  if (target?.kind !== 'name' || target.binding !== 'bound') {
    return [];
  }
  if (value === undefined || !(isPlainLiteral(value) || isCopy(target, value, flow.scope))) {
    return [];
  }
  const reason = `\`${sourceOf(target)}\` is set to \`${sourceOf(value)}\` on line ${String(node.start)}`;
  const known = fact(valueEqualOf(target, value), flow.scope, { holds: true, reason });
  return known === undefined ? [] : [known];
}
