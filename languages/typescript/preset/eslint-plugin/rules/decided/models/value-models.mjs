import { foldTerm, withRange } from '../../../../../../../shared/logic/terms.mjs';
import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { inside } from '../syntax.mjs';

const SIZED_COLLECTIONS = /^(?:Readonly)?(?:Map|Set)$/u;
const TYPED_ARRAYS = /^(?:Big)?(?:Int|Uint|Float)\d+(?:Clamped)?Array$/u;
const INDEX_SEARCHES = new Map([
  ['indexOf', ['string', 'array']],
  ['lastIndexOf', ['string', 'array']],
  ['findIndex', ['array']],
  ['findLastIndex', ['array']],
  ['search', ['string']],
]);

function rangeKey(range) {
  return `${String(range[0])}:${String(range[1])}`;
}

function kindOfPart(part, checker) {
  if ((part.flags & ts.TypeFlags.StringLike) !== 0) {
    return 'string';
  }
  if (checker.isArrayType(part) || checker.isTupleType(part)) {
    return 'array';
  }
  const name = part.getSymbol()?.name ?? '';
  if (SIZED_COLLECTIONS.test(name)) {
    return 'collection';
  }
  return TYPED_ARRAYS.test(name) ? 'array' : undefined;
}

function kindOf(object, services) {
  const checker = services.program.getTypeChecker();
  const type = checker.getNonNullableType(services.getTypeAtLocation(object));
  const kinds = new Set(
    (type.isUnion() ? type.types : [type]).map((part) => kindOfPart(part, checker)),
  );
  return kinds.size === 1 ? [...kinds][0] : undefined;
}

function isMath(node, name) {
  const { callee } = node;
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Math' &&
    callee.property.name === name
  );
}

function memberModel(node, services) {
  if (node.computed || node.optional || node.property.type !== 'Identifier') {
    return undefined;
  }
  const kind = kindOf(node.object, services);
  const isLength = node.property.name === 'length' && (kind === 'string' || kind === 'array');
  return isLength || (node.property.name === 'size' && kind === 'collection') ? 'size' : undefined;
}

function callModel(node, services) {
  if (isMath(node, 'abs') && node.arguments.length === 1) {
    return 'absolute';
  }
  if (isMath(node, 'random') && node.arguments.length === 0) {
    return 'random';
  }
  const { callee } = node;
  const kinds =
    callee.type === 'MemberExpression' ? INDEX_SEARCHES.get(callee.property.name) : undefined;
  const isSearch =
    kinds !== undefined && !callee.computed && kinds.includes(kindOf(callee.object, services));
  return isSearch ? 'index' : undefined;
}

function modelOf(node, services) {
  if (node.type === 'MemberExpression') {
    return memberModel(node, services);
  }
  return node.type === 'CallExpression' && !node.optional ? callModel(node, services) : undefined;
}

function modelTags(root, services) {
  const tags = new Map();
  for (const node of inside(root)) {
    const model = modelOf(node, services);
    if (model !== undefined) {
      tags.set(rangeKey(node.range), model);
    }
  }
  return tags;
}

/**
 * `term` (built from `node`) with value models on the lengths, sizes, index searches, absolute
 * values and random numbers the type checker identifies: the solver then knows what they bound.
 */
export function withModels(term, node, services) {
  const typed = services?.program !== null && services?.program !== undefined;
  const tags = typed ? modelTags(node, services) : new Map();
  if (tags.size === 0) {
    return term;
  }
  return foldTerm(term, (current, children) => {
    const model = current.range === undefined ? undefined : tags.get(rangeKey(current.range));
    const rebuilt = { ...current, children };
    return model === undefined ? rebuilt : withRange({ ...rebuilt, model }, current.range);
  });
}
