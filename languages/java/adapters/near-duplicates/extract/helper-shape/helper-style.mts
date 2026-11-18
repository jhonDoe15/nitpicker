import type { Node } from 'web-tree-sitter';
import type { HelperStyle } from '../../extract-types.mts';
import { enclosingClass, hasModifier, instanceStateOf } from '../class-shape.mts';
import { field, parentOf } from '../syntax.mts';

const STATIC = 'static';
const TYPE_PARAMETERS = 'type_parameters';

function canDeclareStatics(method: Node): boolean {
  const owner = enclosingClass(method) ?? parentOf(parentOf(method));
  const isGeneric = field(owner, TYPE_PARAMETERS) !== undefined;
  return !isGeneric && (parentOf(owner).type === 'program' || hasModifier(owner, STATIC));
}

export const HELPER_AMBIGUOUS =
  'the code may use instance state of the class, which the shared function cannot tell';

export function helperStyleOf(
  method: Node,
  holeNodes: readonly Node[],
  roots?: readonly Node[],
): HelperStyle | undefined {
  if (hasModifier(method, STATIC)) {
    return 'static';
  }
  if (!canDeclareStatics(method)) {
    return 'instance';
  }
  const state = instanceStateOf(method, holeNodes, roots);
  return ({ instance: 'instance', ambiguous: undefined, none: 'static' } as const)[state];
}
