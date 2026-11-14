import { stringValue } from '../analysis/constant-resolution.mjs';
import { importedBindings } from '../security/imported-names.mjs';
import { staticKey, unwrapped } from '../security/security-values.mjs';

const CLASS_PACKAGES = new Set(['@nestjs/graphql', 'type-graphql']);
const FIELD_DECORATORS = new Set(['ResolveField', 'FieldResolver', 'ResolveProperty']);
const PARENT_DECORATORS = new Set(['Parent', 'Root']);
const SERVER_PACKAGES =
  /^(?:@apollo\/|@graphql-tools\/|apollo-server|graphql-yoga$|graphql-tools$|mercurius$)/u;
const ROOT_TYPES = new Set(['Query', 'Mutation', 'Subscription']);
const RESOLVERS_NAME = /resolvers$/iu;
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

function decoratorsOf(node) {
  return (node.decorators ?? []).map((decorator) => {
    const { expression } = decorator;
    return expression.type === 'CallExpression'
      ? expression
      : { callee: expression, arguments: [] };
  });
}

function decoratorNamed(sourceCode, node, names) {
  const bindings = importedBindings(sourceCode.ast);
  return decoratorsOf(node).find(({ callee }) => {
    const binding = callee.type === 'Identifier' ? bindings.get(callee.name) : undefined;
    return binding !== undefined && CLASS_PACKAGES.has(binding.module) && names.has(binding.name);
  });
}

function typeNameOf(argument) {
  const pending = [argument];
  for (const item of pending) {
    const value = unwrapped(item);
    if (value?.type === 'ArrowFunctionExpression') {
      pending.push(value.body);
    } else {
      return value?.type === 'Identifier' ? value.name : stringValue(value);
    }
  }
  return undefined;
}

function parameterType(parameter) {
  const reference = parameter.typeAnnotation?.typeAnnotation;
  return reference?.type === 'TSTypeReference' && reference.typeName.type === 'Identifier'
    ? reference.typeName.name
    : undefined;
}

function parentFromParameters(sourceCode, fn) {
  const holder = fn.params.find(
    (parameter) => decoratorNamed(sourceCode, parameter, PARENT_DECORATORS) !== undefined,
  );
  return holder === undefined ? undefined : parameterType(holder);
}

function classSite(sourceCode, method) {
  if (decoratorNamed(sourceCode, method, FIELD_DECORATORS) === undefined) {
    return undefined;
  }
  const resolver = decoratorNamed(sourceCode, method.parent.parent, new Set(['Resolver']));
  const named = resolver === undefined ? undefined : typeNameOf(resolver.arguments[0]);
  const parent = named ?? parentFromParameters(sourceCode, method.value);
  return parent === undefined ? undefined : { fn: method.value, parent };
}

function usesServerPackage(sourceCode) {
  return [...importedBindings(sourceCode.ast).values()].some(({ module }) =>
    SERVER_PACKAGES.test(module),
  );
}

function isResolverMap(map) {
  const holder = map.parent;
  if (holder.type === 'Property') {
    return staticKey(holder) === 'resolvers';
  }
  const declarator =
    holder.type === 'TSSatisfiesExpression' || holder.type === 'TSAsExpression'
      ? holder.parent
      : holder;
  return (
    declarator.type === 'VariableDeclarator' &&
    declarator.id.type === 'Identifier' &&
    RESOLVERS_NAME.test(declarator.id.name)
  );
}

function fieldFunction(property) {
  const value = unwrapped(property.value);
  if (FUNCTIONS.has(value.type)) {
    return value;
  }
  const resolve =
    value.type === 'ObjectExpression'
      ? value.properties.find((each) => each.type === 'Property' && staticKey(each) === 'resolve')
      : undefined;
  return resolve !== undefined && FUNCTIONS.has(unwrapped(resolve.value).type)
    ? unwrapped(resolve.value)
    : undefined;
}

function mapSite(sourceCode, property) {
  const typeObject = property.parent;
  const typeProperty = typeObject.parent;
  const map = typeProperty?.type === 'Property' ? typeProperty.parent : undefined;
  const parent = typeProperty?.type === 'Property' ? staticKey(typeProperty) : undefined;
  const field = staticKey(property);
  const fn = fieldFunction(property);
  const eligible =
    typeObject.type === 'ObjectExpression' &&
    map?.type === 'ObjectExpression' &&
    fn !== undefined &&
    typeof parent === 'string' &&
    !ROOT_TYPES.has(parent) &&
    typeof field === 'string' &&
    !field.startsWith('__');
  return eligible && isResolverMap(map) && usesServerPackage(sourceCode)
    ? { fn, parent }
    : undefined;
}

export function resolverSite(sourceCode, node) {
  if (node.type === 'MethodDefinition') {
    return classSite(sourceCode, node);
  }
  return node.type === 'Property' ? mapSite(sourceCode, node) : undefined;
}
