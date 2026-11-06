import { libraryBinding, variableOf } from '../../../../libraries/module-bindings.mjs';
import { chainBase } from './library-nodes.mjs';

const PRESENCE_DECORATORS = new Set(['Allow', 'IsOptional', 'IsDefined', 'ValidateIf']);
const CLASS_VALIDATOR = ['class-validator'];
const NON_VALIDATING_PACKAGES = ['class-transformer', '@nestjs/swagger'];
const TYPIA = ['typia'];
const TYPIA_VALIDATORS = /^(create)?(assert|is|equals|validate)/i;
const OPAQUE_KEYWORDS = new Set(['TSUnknownKeyword', 'TSAnyKeyword']);
const OPAQUE_CONTAINERS = new Set(['Array', 'ReadonlyArray', 'Record', 'Partial', 'Map', 'Set']);
const MAX_DEPTH = 6;

function decoratorBinding(sourceCode, decorator) {
  const expression =
    decorator.expression.type === 'CallExpression'
      ? decorator.expression.callee
      : decorator.expression;
  const base = chainBase(expression);
  if (base.type !== 'Identifier') {
    return undefined;
  }
  const variable = variableOf(sourceCode, base);
  const name = expression.type === 'MemberExpression' ? expression.property.name : undefined;
  const validator = libraryBinding(variable, CLASS_VALIDATOR);
  if (validator !== undefined) {
    return { validator: true, name: name ?? validator.name };
  }
  return libraryBinding(variable, NON_VALIDATING_PACKAGES) === undefined
    ? undefined
    : { validator: false, name };
}

export function presenceOnlyDecorators(sourceCode, property) {
  const bindings = (property.decorators ?? []).map((decorator) =>
    decoratorBinding(sourceCode, decorator),
  );
  const validators = bindings.filter((binding) => binding?.validator);
  return validators.length > 0 &&
    bindings.every((binding) => binding !== undefined) &&
    validators.every(({ name }) => PRESENCE_DECORATORS.has(name))
    ? validators.map(({ name }) => `@${name}()`).join(' ')
    : undefined;
}

function isTypiaValidator(sourceCode, call) {
  const base = chainBase(call.callee);
  const binding =
    base.type === 'Identifier' ? libraryBinding(variableOf(sourceCode, base), TYPIA) : undefined;
  const name =
    call.callee.type === 'MemberExpression' && !call.callee.computed
      ? call.callee.property.name
      : binding?.name;
  return binding !== undefined && TYPIA_VALIDATORS.test(name ?? '');
}

export function typiaTypeArgument(sourceCode, call) {
  if (!isTypiaValidator(sourceCode, call)) {
    return undefined;
  }
  return (call.typeArguments ?? call.typeParameters)?.params[0];
}

function declarationsByName(program) {
  const declarations = new Map();
  for (const statement of program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type === 'TSInterfaceDeclaration') {
      declarations.set(declaration.id.name, declaration.body.body);
    }
    if (declaration?.type === 'TSTypeAliasDeclaration') {
      declarations.set(declaration.id.name, declaration.typeAnnotation);
    }
  }
  return declarations;
}

function referenceName(type) {
  return type.type === 'TSTypeReference' && type.typeName.type === 'Identifier'
    ? type.typeName.name
    : undefined;
}

function typeArguments(type) {
  return (type.typeArguments ?? type.typeParameters)?.params ?? [];
}

function isOpaque(type) {
  const pending = [type];
  for (const current of pending) {
    if (OPAQUE_KEYWORDS.has(current.type)) {
      return true;
    }
    if (current.type === 'TSArrayType') {
      pending.push(current.elementType);
    }
    if (current.type === 'TSUnionType') {
      pending.push(...current.types);
    }
    if (OPAQUE_CONTAINERS.has(referenceName(current))) {
      pending.push(...typeArguments(current));
    }
  }
  return false;
}

function objectTypes(type) {
  const types = [];
  const pending = [type];
  for (const current of pending) {
    if (current.type === 'TSArrayType') {
      pending.push(current.elementType);
    } else if (current.type === 'TSUnionType') {
      pending.push(...current.types);
    } else if (OPAQUE_CONTAINERS.has(referenceName(current))) {
      pending.push(...typeArguments(current));
    } else {
      types.push(current);
    }
  }
  return types;
}

function membersOf(type, declarations) {
  if (type.type === 'TSTypeLiteral') {
    return type.members;
  }
  const declared = declarations.get(referenceName(type));
  if (Array.isArray(declared)) {
    return declared;
  }
  return declared?.type === 'TSTypeLiteral' ? declared.members : [];
}

function propertyTypes(members) {
  return members
    .filter((member) => member.type === 'TSPropertySignature' && member.typeAnnotation)
    .map((member) => ({ member, type: member.typeAnnotation.typeAnnotation }));
}

export function opaqueTypeFields(program, root) {
  const declarations = declarationsByName(program);
  const fields = [];
  const seen = new Set();
  const pending = [{ type: root, depth: 0 }];
  for (const { type, depth } of pending) {
    const groups =
      depth > MAX_DEPTH ? [] : objectTypes(type).map((part) => membersOf(part, declarations));
    const unseen = groups.filter((members) => !seen.has(members)).flatMap(propertyTypes);
    for (const members of groups) {
      seen.add(members);
    }
    fields.push(...unseen.filter((entry) => isOpaque(entry.type)).map(({ member }) => member));
    pending.push(
      ...unseen
        .filter((entry) => !isOpaque(entry.type))
        .map((entry) => ({ type: entry.type, depth: depth + 1 })),
    );
  }
  return fields;
}
