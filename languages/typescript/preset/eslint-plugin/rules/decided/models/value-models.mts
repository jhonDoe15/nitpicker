import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { foldTerm, withRange, type Term } from '../../analysis/logic/term-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import { inside, rangeKey } from '../syntax.mts';

type Kind = 'string' | 'array' | 'collection';
type Model = 'size' | 'index' | 'absolute' | 'random';

const STRING = 'string';
const ARRAY = 'array';
const COLLECTION = 'collection';

const SIZED_COLLECTIONS = /^(?:Readonly)?(?:Map|Set)$/u;
const TYPED_ARRAYS = /^(?:Big)?(?:Int|Uint|Float)\d+(?:Clamped)?Array$/u;
const INDEX_SEARCHES = new Map<string, readonly Kind[]>([
  ['indexOf', [STRING, ARRAY]],
  ['lastIndexOf', [STRING, ARRAY]],
  ['findIndex', [ARRAY]],
  ['findLastIndex', [ARRAY]],
  ['search', [STRING]],
]);

function kindOfPart(part: TypeScript.Type, checker: TypeScript.TypeChecker): Kind | undefined {
  if ((part.flags & ts.TypeFlags.StringLike) !== 0) {
    return STRING;
  }
  if (checker.isArrayType(part) || checker.isTupleType(part)) {
    return ARRAY;
  }
  const name = part.getSymbol()?.name ?? '';
  if (SIZED_COLLECTIONS.test(name)) {
    return COLLECTION;
  }
  return TYPED_ARRAYS.test(name) ? ARRAY : undefined;
}

function kindOf(
  object: TSESTree.Node,
  services: ParserServicesWithTypeInformation,
): Kind | undefined {
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(object));
  const kinds = new Set(
    (type.isUnion() ? type.types : [type]).map((part) => kindOfPart(part, checker)),
  );
  return kinds.size === 1 ? [...kinds][0] : undefined;
}

function isMath(node: TSESTree.CallExpression, name: string): boolean {
  const { callee } = node;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Math' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === name
  );
}

function memberModel(
  node: TSESTree.MemberExpression,
  services: ParserServicesWithTypeInformation,
): Model | undefined {
  if (node.computed || node.optional || node.property.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const kind = kindOf(node.object, services);
  const isLength = node.property.name === 'length' && (kind === STRING || kind === ARRAY);
  return isLength || (node.property.name === 'size' && kind === COLLECTION) ? 'size' : undefined;
}

function isIndexSearch(
  node: TSESTree.CallExpression,
  services: ParserServicesWithTypeInformation,
): boolean {
  const { callee } = node;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const kinds = INDEX_SEARCHES.get(callee.property.name);
  const kind = kindOf(callee.object, services);
  return kinds !== undefined && kind !== undefined && kinds.includes(kind);
}

function callModel(
  node: TSESTree.CallExpression,
  services: ParserServicesWithTypeInformation,
): Model | undefined {
  if (isMath(node, 'abs') && node.arguments.length === 1) {
    return 'absolute';
  }
  if (isMath(node, 'random') && node.arguments.length === 0) {
    return 'random';
  }
  return isIndexSearch(node, services) ? 'index' : undefined;
}

function modelOf(
  node: TSESTree.Node,
  services: ParserServicesWithTypeInformation,
): Model | undefined {
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return memberModel(node, services);
  }
  return node.type === AST_NODE_TYPES.CallExpression && !node.optional
    ? callModel(node, services)
    : undefined;
}

function modelTags(
  root: TSESTree.Node,
  services: ParserServicesWithTypeInformation,
): Map<string, Model> {
  const tags = new Map<string, Model>();
  for (const node of inside(root)) {
    const model = modelOf(node, services);
    if (model !== undefined) {
      tags.set(rangeKey(node.range), model);
    }
  }
  return tags;
}

/**
 * `built` (made from `node`) with value models on the lengths, sizes, index searches, absolute
 * values and random numbers the type checker identifies: the solver then knows what they bound.
 */
export function withModels(
  built: Term,
  node: TSESTree.Node,
  services: ParserServicesWithTypeInformation,
): Term {
  const tags = modelTags(node, services);
  if (tags.size === 0) {
    return built;
  }
  return foldTerm<Term>(built, (current, children) => {
    const model = current.range === undefined ? undefined : tags.get(rangeKey(current.range));
    const rebuilt: Term = { ...current, children };
    if (model === undefined) {
      return rebuilt;
    }
    const tagged = { ...rebuilt, model };
    return withRange(tagged, current.range);
  });
}
