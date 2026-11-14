import { isIntegerType } from '../../../../near-duplicates/proof/terms.mjs';
import { fact } from '../../facts.mjs';
import { isPlainLiteral } from '../arms/arms.mjs';
import { binaryOf, sourceOf } from '../exits.mjs';

const EXACT_TYPES = new Set(['String', 'boolean', 'Boolean', 'char', 'Character', 'Char']);

function assignmentOf(node) {
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

function isExactType(name, scope) {
  const text = scope.types.get(name.value);
  return (
    text !== undefined && (EXACT_TYPES.has(text) || isIntegerType({ kind: 'type', value: text }))
  );
}

function isCopy(target, value, scope) {
  return (
    value.kind === 'name' &&
    value.binding === 'bound' &&
    value.value !== target.value &&
    isExactType(target, scope) &&
    isExactType(value, scope)
  );
}

/**
 * What a declaration or a plain assignment statement tells about the name it sets: the name equals
 * a literal, or another local of an exact type (never a floating-point one, which may be NaN).
 */
export function assignedFacts(node, flow) {
  const found = assignmentOf(node);
  if (found === undefined || found.target?.kind !== 'name' || found.target.binding !== 'bound') {
    return [];
  }
  const { target, value } = found;
  if (value === undefined || !(isPlainLiteral(value) || isCopy(target, value, flow.scope))) {
    return [];
  }
  const reason = `\`${sourceOf(target)}\` is set to \`${sourceOf(value)}\` on line ${String(node.start)}`;
  const known = fact(binaryOf('==', target, value), flow.scope, { holds: true, reason });
  return known === undefined ? [] : [known];
}
