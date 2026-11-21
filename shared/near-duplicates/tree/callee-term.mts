import { term } from '../../logic/terms.mts';
import type { Term } from '../../logic/typed/term-types.mts';
import type { TreeNode } from './tree-types.mts';

export function calleeTerm(callee: TreeNode): Term {
  const [receiver] = callee.children;
  return term(
    callee.kind,
    callee.value,
    receiver === undefined ? [] : [term(receiver.kind, receiver.value)],
  );
}
