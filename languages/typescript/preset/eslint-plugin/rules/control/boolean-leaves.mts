import {
  AST_NODE_TYPES,
  type ParserServices,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import { rangeKey as untypedRangeKey } from '../../../../../../shared/logic/terms.mjs';
import { partsOf } from '../analysis/narrowing/type-parts.mts';
import { inside } from '../decided/syntax.mts';
import type { Term } from '../analysis/logic/term-views.mts';
import { hasProgram } from '../security/security-values.mts';
import { ts } from '../typed/typescript-views.mts';

type Range = readonly [number, number];

const rangeKey: (range: Range) => string = untypedRangeKey;
const BOOLEAN = ts.TypeFlags.BooleanLike;

function isBooleanTyped(node: TSESTree.Node, services: ParserServicesWithTypeInformation): boolean {
  return partsOf(services.getTypeAtLocation(node)).every((part) => (part.flags & BOOLEAN) !== 0);
}

/** Whether the TypeScript type of the part of `root` at the range of a leaf is a boolean type. */
export function booleanParts(
  root: TSESTree.Node,
  services: Partial<ParserServices> | undefined,
): (leaf: { readonly term: Term }) => boolean {
  if (!hasProgram(services)) {
    return () => false;
  }
  const known = new Set(
    [...inside(root)]
      .filter((node) => node.type !== AST_NODE_TYPES.Literal && isBooleanTyped(node, services))
      .map(({ range }) => rangeKey(range)),
  );
  return ({ term }) => term.range !== undefined && known.has(rangeKey(term.range));
}
