import { toTree } from '../../tree.mts';
import type { Shortcut, Tree, TreeLike } from '../../common/types.mts';

type TreeDetector = (fixtureTree: Tree, finalTree: Tree) => Shortcut[];

export function overTrees(
  detector: TreeDetector,
): (fixture: TreeLike, final: TreeLike) => Shortcut[] {
  return (fixture, final) => detector(toTree(fixture), toTree(final));
}

export function kinds(shortcuts: readonly Shortcut[]): string[] {
  return shortcuts.map((shortcut) => shortcut.kind);
}
