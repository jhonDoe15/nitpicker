import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { staticKeyName } from '../../analysis/static-shapes.mts';
import type { SourceCode } from '../../typed/node-views.mts';

export type Input = {
  readonly node: TSESTree.Node;
  readonly text: string;
  readonly element: string | undefined;
};
export type InputSet = Map<string, Input>;
export type Declared = TSESTree.TypeNode | TSESTree.TSInterfaceBody;
export type Declarations = Map<string, Declared>;
type Expanding = TSESTree.TSUnionType | TSESTree.TSIntersectionType | TSESTree.TSTypeReference;

const MAX_EXPANSIONS = 200;
const ARRAY_NAMES = new Set<string>(['Array', 'ReadonlyArray']);
const EMPTY_TYPES = new Set<string>([
  AST_NODE_TYPES.TSUndefinedKeyword,
  AST_NODE_TYPES.TSNullKeyword,
]);

function isExpanding(node: Declared): node is Expanding {
  return (
    node.type === AST_NODE_TYPES.TSUnionType ||
    node.type === AST_NODE_TYPES.TSIntersectionType ||
    node.type === AST_NODE_TYPES.TSTypeReference
  );
}

function elementTypeOf(declared: TSESTree.TypeNode): TSESTree.TypeNode | undefined {
  const operand =
    declared.type === AST_NODE_TYPES.TSTypeOperator && declared.operator === 'readonly'
      ? declared.typeAnnotation
      : undefined;
  const type = operand ?? declared;
  if (type.type === AST_NODE_TYPES.TSArrayType) {
    return type.elementType;
  }
  const isArrayReference =
    type.type === AST_NODE_TYPES.TSTypeReference &&
    type.typeName.type === AST_NODE_TYPES.Identifier &&
    ARRAY_NAMES.has(type.typeName.name);
  return isArrayReference ? type.typeArguments?.params[0] : undefined;
}

function withoutEmpty(annotation: TSESTree.TypeNode): TSESTree.TypeNode {
  if (annotation.type !== AST_NODE_TYPES.TSUnionType) {
    return annotation;
  }
  const kept = annotation.types.filter((type) => !EMPTY_TYPES.has(type.type));
  const [only] = kept;
  return kept.length === 1 && only !== undefined ? only : annotation;
}

export function typedInput(
  declared: TSESTree.TypeNode,
  node: TSESTree.Node,
  sourceCode: SourceCode,
): Input {
  const annotation = withoutEmpty(declared);
  const element = elementTypeOf(annotation);
  return {
    node,
    text: sourceCode.getText(annotation),
    element: element === undefined ? undefined : sourceCode.getText(element),
  };
}

function membersOf(node: Declared): readonly TSESTree.TypeElement[] {
  if (node.type === AST_NODE_TYPES.TSTypeLiteral) {
    return node.members;
  }
  return node.type === AST_NODE_TYPES.TSInterfaceBody ? node.body : [];
}

function expansionsOf(node: Expanding, declarations: Declarations): Declared[][] {
  if (node.type === AST_NODE_TYPES.TSUnionType) {
    return node.types.map((type) => [type]);
  }
  if (node.type === AST_NODE_TYPES.TSIntersectionType) {
    return [node.types];
  }
  const declared =
    node.typeName.type === AST_NODE_TYPES.Identifier
      ? declarations.get(node.typeName.name)
      : undefined;
  return declared === undefined ? [[]] : [[declared]];
}

function branchesOf(
  root: Declared,
  declarations: Declarations,
): (readonly TSESTree.TypeElement[])[] {
  const branches: (readonly TSESTree.TypeElement[])[] = [];
  const pending: Declared[][] = [[root]];
  for (const nodes of pending) {
    if (pending.length > MAX_EXPANSIONS) {
      break;
    }
    const index = nodes.findIndex(isExpanding);
    const target = nodes[index];
    if (target === undefined || !isExpanding(target)) {
      branches.push(nodes.flatMap(membersOf));
      continue;
    }
    const rest = nodes.filter((_, position) => position !== index);
    for (const expansion of expansionsOf(target, declarations)) {
      pending.push([...rest, ...expansion]);
    }
  }
  return branches;
}

function optionalMembers(
  members: readonly TSESTree.TypeElement[],
  sourceCode: SourceCode,
): InputSet {
  const inputs: InputSet = new Map();
  for (const member of members) {
    if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
      continue;
    }
    const annotation = member.typeAnnotation?.typeAnnotation;
    const name = staticKeyName(member);
    if (name !== undefined && member.optional && annotation !== undefined) {
      inputs.set(name, typedInput(annotation, member, sourceCode));
    }
  }
  return inputs;
}

export function memberInputSets(
  typeNode: Declared,
  declarations: Declarations,
  sourceCode: SourceCode,
): InputSet[] {
  return branchesOf(typeNode, declarations).map((members) => optionalMembers(members, sourceCode));
}
