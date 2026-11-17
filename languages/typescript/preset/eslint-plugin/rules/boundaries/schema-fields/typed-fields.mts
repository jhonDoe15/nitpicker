import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, type SourceCode } from '../../typed/node-views.mts';
import { libraryBinding, variableOf } from './library-bindings.mts';
import { chainBase } from './library-nodes.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

type Declared = TSESTree.TypeElement[] | TSESTree.TypeNode;
type DecoratorBinding = { readonly validator: boolean; readonly name: string | undefined };
type PropertyType = {
  readonly member: TSESTree.TSPropertySignature;
  readonly type: TSESTree.TypeNode;
};

const PRESENCE_DECORATORS = new Set<string | undefined>([
  'Allow',
  'IsOptional',
  'IsDefined',
  'ValidateIf',
]);
const CLASS_VALIDATOR = ['class-validator'];
const NON_VALIDATING_PACKAGES = ['class-transformer', '@nestjs/swagger'];
const TYPIA = ['typia'];
const TYPIA_VALIDATORS = /^(create)?(assert|is|equals|validate)/i;
const OPAQUE_KEYWORDS = new Set<string>([
  AST_NODE_TYPES.TSUnknownKeyword,
  AST_NODE_TYPES.TSAnyKeyword,
]);
const OPAQUE_CONTAINERS = new Set<string | undefined>([
  'Array',
  'ReadonlyArray',
  'Record',
  'Partial',
  'Map',
  'Set',
]);
const MAX_DEPTH = 6;

function decoratorBinding(
  sourceCode: SourceCode,
  decorator: TSESTree.Decorator,
): DecoratorBinding | undefined {
  const expression =
    decorator.expression.type === AST_NODE_TYPES.CallExpression
      ? decorator.expression.callee
      : decorator.expression;
  const base = chainBase(expression);
  if (base.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const variable = variableOf(sourceCode, base);
  const name =
    expression.type === AST_NODE_TYPES.MemberExpression ? nameOf(expression.property) : undefined;
  const validator = libraryBinding(variable, CLASS_VALIDATOR);
  if (validator !== undefined) {
    return { validator: true, name: name ?? validator.name };
  }
  return libraryBinding(variable, NON_VALIDATING_PACKAGES) === undefined
    ? undefined
    : { validator: false, name };
}

export function presenceOnlyDecorators(
  sourceCode: SourceCode,
  property: TSESTree.PropertyDefinition | TSESTree.AccessorProperty,
): string | undefined {
  const bindings = property.decorators.map((decorator) => decoratorBinding(sourceCode, decorator));
  const validators = bindings.flatMap((binding) => (binding?.validator ? [binding] : []));
  return validators.length > 0 &&
    bindings.every((binding) => binding !== undefined) &&
    validators.every(({ name }) => PRESENCE_DECORATORS.has(name))
    ? validators.map(({ name }) => `@${name ?? ''}()`).join(' ')
    : undefined;
}

function isTypiaValidator(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const base = chainBase(call.callee);
  const binding =
    base.type === AST_NODE_TYPES.Identifier
      ? libraryBinding(variableOf(sourceCode, base), TYPIA)
      : undefined;
  const name =
    call.callee.type === AST_NODE_TYPES.MemberExpression && !call.callee.computed
      ? nameOf(call.callee.property)
      : binding?.name;
  return binding !== undefined && TYPIA_VALIDATORS.test(name ?? '');
}

export function typiaTypeArgument(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): TSESTree.TypeNode | undefined {
  if (!isTypiaValidator(sourceCode, call)) {
    return undefined;
  }
  return call.typeArguments?.params[0];
}

function declarationsByName(program: TSESTree.Program): Map<string, Declared> {
  const declarations = new Map<string, Declared>();
  for (const statement of program.body) {
    const declaration =
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration ? statement.declaration : statement;
    if (declaration?.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
      declarations.set(declaration.id.name, declaration.body.body);
    }
    if (declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
      declarations.set(declaration.id.name, declaration.typeAnnotation);
    }
  }
  return declarations;
}

function referenceName(type: TSESTree.TypeNode): string | undefined {
  return type.type === AST_NODE_TYPES.TSTypeReference &&
    type.typeName.type === AST_NODE_TYPES.Identifier
    ? type.typeName.name
    : undefined;
}

function typeArguments(type: TSESTree.TypeNode): TSESTree.TypeNode[] {
  return type.type === AST_NODE_TYPES.TSTypeReference ? (type.typeArguments?.params ?? []) : [];
}

function isOpaque(type: TSESTree.TypeNode): boolean {
  const pending = [type];
  for (const current of pending) {
    if (OPAQUE_KEYWORDS.has(current.type)) {
      return true;
    }
    if (current.type === AST_NODE_TYPES.TSArrayType) {
      pending.push(current.elementType);
    }
    if (current.type === AST_NODE_TYPES.TSUnionType) {
      appendAll(pending, current.types);
    }
    if (OPAQUE_CONTAINERS.has(referenceName(current))) {
      appendAll(pending, typeArguments(current));
    }
  }
  return false;
}

function objectTypes(type: TSESTree.TypeNode): TSESTree.TypeNode[] {
  const types: TSESTree.TypeNode[] = [];
  const pending = [type];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.TSArrayType) {
      pending.push(current.elementType);
    } else if (current.type === AST_NODE_TYPES.TSUnionType) {
      appendAll(pending, current.types);
    } else if (OPAQUE_CONTAINERS.has(referenceName(current))) {
      appendAll(pending, typeArguments(current));
    } else {
      types.push(current);
    }
  }
  return types;
}

function membersOf(
  type: TSESTree.TypeNode,
  declarations: Map<string, Declared>,
): readonly TSESTree.TypeElement[] {
  if (type.type === AST_NODE_TYPES.TSTypeLiteral) {
    return type.members;
  }
  const name = referenceName(type);
  const declared = name === undefined ? undefined : declarations.get(name);
  if (Array.isArray(declared)) {
    return declared;
  }
  return declared?.type === AST_NODE_TYPES.TSTypeLiteral ? declared.members : [];
}

function propertyTypes(members: readonly TSESTree.TypeElement[]): PropertyType[] {
  return members.flatMap((member) =>
    member.type === AST_NODE_TYPES.TSPropertySignature && member.typeAnnotation
      ? [{ member, type: member.typeAnnotation.typeAnnotation }]
      : [],
  );
}

export function opaqueTypeFields(
  program: TSESTree.Program,
  root: TSESTree.TypeNode,
): PropertyType[] {
  const declarations = declarationsByName(program);
  const fields: PropertyType[] = [];
  const seen = new Set<readonly TSESTree.TypeElement[]>();
  const pending = [{ type: root, depth: 0 }];
  for (const { type, depth } of pending) {
    const groups =
      depth > MAX_DEPTH ? [] : objectTypes(type).map((part) => membersOf(part, declarations));
    const unseen = groups.filter((members) => !seen.has(members)).flatMap(propertyTypes);
    for (const members of groups) {
      seen.add(members);
    }
    appendAll(
      fields,
      unseen.filter((entry) => isOpaque(entry.type)),
    );
    appendAll(
      pending,
      unseen
        .filter((entry) => !isOpaque(entry.type))
        .map((entry) => ({ type: entry.type, depth: depth + 1 })),
    );
  }
  return fields;
}
