import { chainOf } from '../analysis/ancestry.mjs';
import { findVariable, stringValue } from '../analysis/constant-resolution.mjs';
import { loadedModule } from '../security/imported-names.mjs';
import { memberName, staticKey, unwrapped } from '../security/security-values.mjs';

export const TYPEORM = 'typeorm';
export const SEQUELIZE = 'sequelize';
export const MIKRO_ORM = 'mikro-orm';
export const DRIZZLE = 'drizzle';

const SEQUELIZE_MODULES = new Set([
  'sequelize',
  'sequelize-typescript',
  '@sequelize/core',
  '@nestjs/sequelize',
]);
const FAMILIES = [
  [TYPEORM, (source) => source === 'typeorm' || source === '@nestjs/typeorm'],
  [SEQUELIZE, (source) => SEQUELIZE_MODULES.has(source)],
  [MIKRO_ORM, (source) => source.startsWith('@mikro-orm/')],
  [DRIZZLE, (source) => source === 'drizzle-orm' || source.startsWith('drizzle-orm/')],
];

function statementsOf(program) {
  return program.body.map((statement) =>
    statement.type === 'ExportNamedDeclaration' && statement.declaration
      ? statement.declaration
      : statement,
  );
}

function importedName(specifier) {
  if (specifier.type !== 'ImportSpecifier') {
    return '*';
  }
  return specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : specifier.imported.value;
}

function patternBindings(pattern, source) {
  if (pattern.type === 'Identifier') {
    return [[pattern.name, { source, imported: '*' }]];
  }
  const properties = pattern.type === 'ObjectPattern' ? pattern.properties : [];
  return properties
    .filter((property) => property.type === 'Property' && property.value.type === 'Identifier')
    .map((property) => [property.value.name, { source, imported: staticKey(property) }]);
}

function statementBindings(statement) {
  if (statement.type === 'ImportDeclaration') {
    return statement.specifiers.map((specifier) => [
      specifier.local.name,
      { source: statement.source.value, imported: importedName(specifier) },
    ]);
  }
  if (statement.type === 'TSImportEqualsDeclaration') {
    const source = stringValue(statement.moduleReference?.expression);
    return source === undefined ? [] : [[statement.id.name, { source, imported: '*' }]];
  }
  const declarations = statement.type === 'VariableDeclaration' ? statement.declarations : [];
  return declarations.flatMap((declarator) => {
    const source = loadedModule(declarator.init);
    return typeof source === 'string' ? patternBindings(declarator.id, source) : [];
  });
}

function isOrmModule(source) {
  return FAMILIES.some(([, matches]) => matches(source));
}

export function moduleScope(context) {
  const bindings = new Map(statementsOf(context.sourceCode.ast).flatMap(statementBindings));
  const sources = [...bindings.values()].map(({ source }) => source);
  const families = new Set(
    FAMILIES.filter(([, matches]) => sources.some(matches)).map(([family]) => family),
  );
  return { context, bindings, families };
}

export function ormLocals(scope, name) {
  const locals = [...scope.bindings]
    .filter(([, { source, imported }]) => isOrmModule(source) && imported === name)
    .map(([local]) => local);
  return new Set(locals);
}

function rootName(node) {
  const steps = chainOf(unwrapped(node), (current) => {
    if (current.type === 'MemberExpression') {
      return unwrapped(current.object);
    }
    return current.type === 'CallExpression' ? unwrapped(current.callee) : undefined;
  });
  const root = steps.at(-1);
  return root?.type === 'Identifier' ? root.name : undefined;
}

export function isForeignReceiver(scope, receiver) {
  const binding = scope.bindings.get(rootName(receiver));
  return binding !== undefined && !binding.source.startsWith('.') && !isOrmModule(binding.source);
}

export function calleeLabel(call) {
  const callee = unwrapped(call.callee);
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  if (callee.type !== 'MemberExpression') {
    return undefined;
  }
  const owner = unwrapped(callee.object);
  const name = memberName(callee);
  return owner.type === 'Identifier' ? `${owner.name}.${name}` : name;
}

export function constructedName(call) {
  return calleeLabel(call)?.split('.').at(-1);
}

export function initializerOf(scope, receiver) {
  const target = unwrapped(receiver);
  if (target?.type !== 'Identifier') {
    return undefined;
  }
  const definition = findVariable(scope.context, target, target.name)?.defs[0];
  const init = definition?.type === 'Variable' ? unwrapped(definition.node.init) : undefined;
  return init?.type === 'AwaitExpression' ? unwrapped(init.argument) : init;
}

const FORM_LENGTH = 40;

export function shortText(context, node, fallback) {
  const text = context.sourceCode.getText(node);
  return text.length > FORM_LENGTH || text.includes('\n') ? fallback : text;
}
