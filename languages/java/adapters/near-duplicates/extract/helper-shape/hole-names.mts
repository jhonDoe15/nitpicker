import type { Node } from 'web-tree-sitter';
import type { AlignHole } from '../../extract-types.mts';
import { nameHoles as sharedNameHoles } from '../../jvm-views.mts';
import { parentOf, present, required } from '../syntax.mts';

function flowName(node: Node): string | undefined {
  const declarator = parentOf(node);
  if (declarator.type === 'variable_declarator') {
    return required(declarator, 'name').text;
  }
  return node.type === 'identifier' ? node.text : undefined;
}

function stemOf(hole: AlignHole): string | undefined {
  if ('stem' in hole && hole.stem !== undefined) {
    return hole.stem;
  }
  const stem = flowName(present(hole.occurrences[0]).a);
  return hole.kind === 'deferred' ? `${stem ?? 'value'}Supplier` : stem;
}

export function nameHoles<Hole extends AlignHole>(
  holes: readonly Hole[],
  taken: ReadonlySet<string>,
): (Hole & { name: string })[] | undefined {
  return sharedNameHoles(holes, taken, stemOf);
}
