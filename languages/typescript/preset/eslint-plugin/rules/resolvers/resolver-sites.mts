import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../analysis/constant-resolution.mts';
import { importedBindings } from '../security/imported-names.mts';
import { staticKey, unwrapped } from '../security/security-values.mts';
import { type SourceCode } from '../typed/node-views.mts';
import { isCallback, type Callback } from '../typed/syntax-views.mts';

type Decorated = { readonly decorators: readonly TSESTree.Decorator[] };
type DecoratorCall = {
  readonly callee: TSESTree.Node;
  readonly arguments: readonly TSESTree.Node[];
};
type MaybeNode = TSESTree.Node | undefined;
export type ResolverSite = { readonly fn: Callback; readonly parent: string };

const CLASS_PACKAGES = new Set(['@nestjs/graphql', 'type-graphql']);
const FIELD_DECORATORS = new Set(['ResolveField', 'FieldResolver', 'ResolveProperty']);
const PARENT_DECORATORS = new Set(['Parent', 'Root']);
const SERVER_PACKAGES =
  /^(?:@apollo\/|@graphql-tools\/|apollo-server|graphql-yoga$|graphql-tools$|mercurius$)/u;
const ROOT_TYPES = new Set(['Query', 'Mutation', 'Subscription']);
const RESOLVERS_NAME = /resolvers$/iu;

function decoratorsOf(node: Decorated): DecoratorCall[] {
  return node.decorators.map((decorator) => {
    const { expression } = decorator;
    return expression.type === AST_NODE_TYPES.CallExpression
      ? expression
      : { callee: expression, arguments: [] };
  });
}

function decoratorNamed(
  sourceCode: SourceCode,
  node: Decorated,
  names: ReadonlySet<string>,
): DecoratorCall | undefined {
  const bindings = importedBindings(sourceCode.ast);
  return decoratorsOf(node).find(({ callee }) => {
    const binding =
      callee.type === AST_NODE_TYPES.Identifier ? bindings.get(callee.name) : undefined;
    return binding !== undefined && CLASS_PACKAGES.has(binding.module) && names.has(binding.name);
  });
}

function typeNameOf(argument: MaybeNode): string | undefined {
  const pending = [argument];
  for (const item of pending) {
    const value = item === undefined ? undefined : unwrapped(item);
    if (value?.type === AST_NODE_TYPES.ArrowFunctionExpression) {
      pending.push(value.body);
    } else {
      return value?.type === AST_NODE_TYPES.Identifier ? value.name : stringValue(value);
    }
  }
  return undefined;
}

function parameterType(parameter: TSESTree.Parameter): string | undefined {
  const reference =
    'typeAnnotation' in parameter ? parameter.typeAnnotation?.typeAnnotation : undefined;
  return reference?.type === AST_NODE_TYPES.TSTypeReference &&
    reference.typeName.type === AST_NODE_TYPES.Identifier
    ? reference.typeName.name
    : undefined;
}

function parentFromParameters(sourceCode: SourceCode, fn: Callback): string | undefined {
  const holder = fn.params.find(
    (parameter) => decoratorNamed(sourceCode, parameter, PARENT_DECORATORS) !== undefined,
  );
  return holder === undefined ? undefined : parameterType(holder);
}

function classSite(
  sourceCode: SourceCode,
  method: TSESTree.MethodDefinition,
): ResolverSite | undefined {
  const owner = method.parent.parent;
  const fn = method.value;
  if (
    decoratorNamed(sourceCode, method, FIELD_DECORATORS) === undefined ||
    fn.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return undefined;
  }
  const resolver = decoratorNamed(sourceCode, owner, new Set(['Resolver']));
  const named = resolver === undefined ? undefined : typeNameOf(resolver.arguments[0]);
  const parent = named ?? parentFromParameters(sourceCode, fn);
  return parent === undefined ? undefined : { fn, parent };
}

function usesServerPackage(sourceCode: SourceCode): boolean {
  return [...importedBindings(sourceCode.ast).values()].some(({ module }) =>
    SERVER_PACKAGES.test(module),
  );
}

function isResolverMap(map: TSESTree.ObjectExpression): boolean {
  const holder = map.parent;
  if (holder.type === AST_NODE_TYPES.Property) {
    return staticKey(holder) === 'resolvers';
  }
  const declarator =
    holder.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    holder.type === AST_NODE_TYPES.TSAsExpression
      ? holder.parent
      : holder;
  return (
    declarator.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.id.type === AST_NODE_TYPES.Identifier &&
    RESOLVERS_NAME.test(declarator.id.name)
  );
}

function fieldFunction(property: TSESTree.Property): Callback | undefined {
  const value = unwrapped(property.value);
  if (isCallback(value)) {
    return value;
  }
  const resolve =
    value.type === AST_NODE_TYPES.ObjectExpression
      ? value.properties.find(
          (each): each is TSESTree.Property =>
            each.type === AST_NODE_TYPES.Property && staticKey(each) === 'resolve',
        )
      : undefined;
  const handler = resolve === undefined ? undefined : unwrapped(resolve.value);
  return isCallback(handler) ? handler : undefined;
}

function mapSite(sourceCode: SourceCode, property: TSESTree.Property): ResolverSite | undefined {
  const typeObject = property.parent;
  const typeProperty = typeObject.parent;
  const map = typeProperty.type === AST_NODE_TYPES.Property ? typeProperty.parent : undefined;
  const parent =
    typeProperty.type === AST_NODE_TYPES.Property ? staticKey(typeProperty) : undefined;
  const field = staticKey(property);
  const fn = fieldFunction(property);
  const eligible =
    map?.type === AST_NODE_TYPES.ObjectExpression &&
    fn !== undefined &&
    typeof parent === 'string' &&
    !ROOT_TYPES.has(parent) &&
    typeof field === 'string' &&
    !field.startsWith('__');
  return eligible && isResolverMap(map) && usesServerPackage(sourceCode)
    ? { fn, parent }
    : undefined;
}

export function resolverSite(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): ResolverSite | undefined {
  if (node.type === AST_NODE_TYPES.MethodDefinition) {
    return classSite(sourceCode, node);
  }
  return node.type === AST_NODE_TYPES.Property ? mapSite(sourceCode, node) : undefined;
}
