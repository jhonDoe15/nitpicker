import { rangeKey } from '../../../../../../shared/logic/terms.mjs';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { partsOf } from '../analysis/narrowing/type-parts.mjs';
import { inside } from '../decided/syntax.mjs';

const BOOLEAN = ts.TypeFlags.BooleanLike;

/** Whether the TypeScript type of the part of `root` at the range of `leaf` is a boolean type. */
export function booleanParts(root, services) {
  if (services?.program === null || services?.program === undefined) {
    return () => false;
  }
  const known = new Set(
    [...inside(root)]
      .filter((node) => node.range !== undefined && node.type !== 'Literal')
      .filter((node) =>
        partsOf(services.getTypeAtLocation(node)).every((part) => (part.flags & BOOLEAN) !== 0),
      )
      .map(({ range }) => rangeKey(range)),
  );
  return ({ term }) => term.range !== undefined && known.has(rangeKey(term.range));
}
