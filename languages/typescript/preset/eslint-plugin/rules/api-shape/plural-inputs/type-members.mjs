import { staticKeyName } from '../../analysis/static-shapes.mjs';

const MAX_EXPANSIONS = 200;
const EXPANDING_TYPES = new Set(['TSUnionType', 'TSIntersectionType', 'TSTypeReference']);
const ARRAY_NAMES = new Set(['Array', 'ReadonlyArray']);
const EMPTY_TYPES = new Set(['TSUndefinedKeyword', 'TSNullKeyword']);

function elementTypeOf(declared) {
  const type =
    declared.type === 'TSTypeOperator' && declared.operator === 'readonly'
      ? declared.typeAnnotation
      : declared;
  if (type.type === 'TSArrayType') {
    return type.elementType;
  }
  const isArrayReference =
    type.type === 'TSTypeReference' &&
    type.typeName.type === 'Identifier' &&
    ARRAY_NAMES.has(type.typeName.name);
  return isArrayReference ? (type.typeArguments ?? type.typeParameters)?.params[0] : undefined;
}

function withoutEmpty(annotation) {
  if (annotation.type !== 'TSUnionType') {
    return annotation;
  }
  const kept = annotation.types.filter((type) => !EMPTY_TYPES.has(type.type));
  return kept.length === 1 ? kept[0] : annotation;
}

export function typedInput(declared, node, sourceCode) {
  const annotation = withoutEmpty(declared);
  const element = elementTypeOf(annotation);
  return {
    node,
    text: sourceCode.getText(annotation),
    element: element === undefined ? undefined : sourceCode.getText(element),
  };
}

function membersOf(node) {
  if (node.type === 'TSTypeLiteral') {
    return node.members;
  }
  return node.type === 'TSInterfaceBody' ? node.body : [];
}

function expansionsOf(node, declarations) {
  if (node.type === 'TSUnionType') {
    return node.types.map((type) => [type]);
  }
  if (node.type === 'TSIntersectionType') {
    return [node.types];
  }
  const declared =
    node.typeName.type === 'Identifier' ? declarations.get(node.typeName.name) : undefined;
  return declared === undefined ? [[]] : [[declared]];
}

function branchesOf(root, declarations) {
  const branches = [];
  const pending = [[root]];
  for (const nodes of pending) {
    if (pending.length > MAX_EXPANSIONS) {
      break;
    }
    const index = nodes.findIndex((node) => EXPANDING_TYPES.has(node.type));
    if (index === -1) {
      branches.push(nodes.flatMap(membersOf));
      continue;
    }
    const rest = nodes.filter((_, position) => position !== index);
    for (const expansion of expansionsOf(nodes[index], declarations)) {
      pending.push([...rest, ...expansion]);
    }
  }
  return branches;
}

function optionalMembers(members, sourceCode) {
  const inputs = new Map();
  for (const member of members) {
    const annotation = member.typeAnnotation?.typeAnnotation;
    const name =
      member.type === 'TSPropertySignature'
        ? staticKeyName(member.key, member.computed)
        : undefined;
    if (name !== undefined && member.optional === true && annotation !== undefined) {
      inputs.set(name, typedInput(annotation, member, sourceCode));
    }
  }
  return inputs;
}

export function memberInputSets(typeNode, declarations, sourceCode) {
  return branchesOf(typeNode, declarations).map((members) => optionalMembers(members, sourceCode));
}
