import type { Node } from 'web-tree-sitter';
import type {
  AlignState,
  Attempt,
  NamedTypeHole,
  Pair,
  UsedTypeHole,
} from '../../extract-types.mts';
import { recordTypeHole, typePairProblem } from '../../jvm-views.mts';
import { namedChildren, pairOf, present, squashed } from '../syntax.mts';
import { TYPE_PARAMETER_NAMES } from '../../../../../../shared/fix/recipes/extract/names.mjs';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

const NAMED = new Set(['type_identifier', 'scoped_type_identifier']);
const DIFFERENT = 'the copies use different types';

function zipped(left: readonly Node[], right: readonly Node[]): Attempt<{ pairs: Pair[] }> {
  return left.length === right.length
    ? { pairs: left.map((node, index): Pair => [node, present(right[index])]) }
    : { declined: DIFFERENT };
}

function genericParts(x: Node, y: Node): Attempt<{ pairs: Pair[] }> {
  const [rawX, argumentsX] = namedChildren(x);
  const [rawY, argumentsY] = namedChildren(y);
  if (squashed(present(rawX)) !== squashed(present(rawY))) {
    return { declined: DIFFERENT };
  }
  return zipped(namedChildren(present(argumentsX)), namedChildren(present(argumentsY)));
}

function arrayParts(x: Node, y: Node): Attempt<{ pairs: Pair[] }> {
  const [left, right] = pairOf([x, y].map((node) => node.namedChildren));
  const dimensions = [left.at(-1), right.at(-1)].map((node) => squashed(present(node)));
  return dimensions[0] === dimensions[1]
    ? { pairs: [[present(left[0]), present(right[0])]] }
    : { declined: DIFFERENT };
}

function partsOf(x: Node, y: Node): Attempt<{ pairs: Pair[] }> {
  if (x.type !== y.type) {
    return { declined: DIFFERENT };
  }
  if (x.type === 'generic_type') {
    return genericParts(x, y);
  }
  if (x.type === 'catch_type') {
    return zipped(namedChildren(x), namedChildren(y));
  }
  return x.type === 'array_type' ? arrayParts(x, y) : { declined: DIFFERENT };
}

function expand(state: AlignState, [x, y]: Pair, pending: Pair[]): string | undefined {
  const texts = [x, y].map((node) => squashed(node));
  if (texts[0] === texts[1]) {
    return undefined;
  }
  if (NAMED.has(x.type) && NAMED.has(y.type)) {
    recordTypeHole(state.holes, [x, y], texts);
    return undefined;
  }
  const parts = partsOf(x, y);
  appendAll(pending, parts.pairs ?? []);
  return parts.declined;
}

export function typeStep(state: AlignState, x: Node, y: Node): string | undefined {
  function expandIn(pair: Pair, pending: Pair[]): string | undefined {
    return expand(state, pair, pending);
  }
  return typePairProblem(state.typeSites, [x, y], { textOf: squashed, expand: expandIn });
}

const TYPE_NAMES: readonly string[] = TYPE_PARAMETER_NAMES;

const EXCEPTION_NAMES = ['E', ...Array.from({ length: 9 }, (_, index) => `E${String(index + 2)}`)];

export function nameTypeHoles(
  holes: readonly UsedTypeHole[],
  taken: ReadonlySet<string>,
): NamedTypeHole[] | undefined {
  const free = {
    type: TYPE_NAMES.filter((name) => !taken.has(name)),
    exception: EXCEPTION_NAMES.filter((name) => !taken.has(name)),
  };
  const named = holes.map((hole) => ({
    ...hole,
    name: free[hole.usage === 'exception' ? 'exception' : 'type'].shift(),
  }));
  const found = named.flatMap(({ name, ...hole }) =>
    name === undefined ? [] : [{ ...hole, name }],
  );
  return found.length === named.length ? found : undefined;
}
