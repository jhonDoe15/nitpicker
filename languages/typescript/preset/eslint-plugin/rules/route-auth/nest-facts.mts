import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { childrenOf } from '../loops/loop-shapes.mts';
import { importedBindings, type ImportedBinding } from '../security/imported-names.mts';
import { nameOf, type VisitorKeys } from '../typed/node-views.mts';
import { middlewareName } from './middleware-names.mts';
import { decoratorInfo, isAuthName } from './shapes.mts';

export type Bindings = Map<string, ImportedBinding>;
export type MaybeNode = TSESTree.Node | undefined;
export type Facts = {
  readonly shapes: ReadonlySet<string>;
  readonly isAuth: boolean;
  readonly isPublic: boolean;
};
export type NestHandler = Facts & { readonly node: TSESTree.MethodDefinition };
export type MemberCall = TSESTree.CallExpression & { readonly callee: TSESTree.MemberExpression };
type ClassNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;

const VERBS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Options', 'Head']);
const NEST_COMMON = '@nestjs/common';

function isNestDecorator(decorator: TSESTree.Decorator, name: string, bindings: Bindings): boolean {
  const expression =
    decorator.expression.type === AST_NODE_TYPES.CallExpression
      ? decorator.expression.callee
      : decorator.expression;
  return (
    expression.type === AST_NODE_TYPES.Identifier &&
    expression.name === name &&
    bindings.get(name)?.module === NEST_COMMON
  );
}

function describeHandler(
  method: TSESTree.MethodDefinition,
  classDecorators: readonly TSESTree.Decorator[],
): NestHandler {
  const decorators = [...method.decorators, ...classDecorators].map(decoratorInfo);
  return {
    node: method,
    shapes: new Set(decorators.filter((each) => each.isAuth).map((each) => each.shape)),
    isAuth: decorators.some((each) => each.isAuth),
    isPublic: decorators.some((each) => each.isPublic),
  };
}

function controllerHandlers(klass: ClassNode, bindings: Bindings): NestHandler[] {
  const isController = klass.decorators.some((each) =>
    isNestDecorator(each, 'Controller', bindings),
  );
  if (!isController) {
    return [];
  }
  return klass.body.body
    .filter((member) => member.type === AST_NODE_TYPES.MethodDefinition)
    .filter((member) =>
      member.decorators.some((each) =>
        [...VERBS].some((verb) => isNestDecorator(each, verb, bindings)),
      ),
    )
    .map((member) => describeHandler(member, klass.decorators));
}

export function walk(
  program: TSESTree.Node,
  visitorKeys: VisitorKeys,
  visit: (node: TSESTree.Node) => void,
): void {
  const pending = [program];
  for (const node of pending) {
    visit(node);
    pending.push(...childrenOf(node, visitorKeys));
  }
}

export function isNamedCall(node: MaybeNode, name: string): node is MemberCall {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(node.callee.property) === name
  );
}

function appliesAuthMiddleware(node: TSESTree.Node): boolean {
  if (!isNamedCall(node, 'forRoutes')) {
    return false;
  }
  const chain = [node.callee.object];
  for (const link of chain) {
    if (isNamedCall(link, 'exclude')) {
      chain.push(link.callee.object);
    }
  }
  const current = chain.at(-1);
  return (
    isNamedCall(current, 'apply') &&
    current.arguments.some((arg) => isAuthName(middlewareName(arg)))
  );
}

export function nestFacts(
  program: TSESTree.Program,
  visitorKeys: VisitorKeys,
): { readonly handlers: NestHandler[]; readonly global: boolean } {
  const bindings = importedBindings(program);
  const handlers: NestHandler[] = [];
  let global = false;
  walk(program, visitorKeys, (node) => {
    if (
      node.type === AST_NODE_TYPES.ClassDeclaration ||
      node.type === AST_NODE_TYPES.ClassExpression
    ) {
      handlers.push(...controllerHandlers(node, bindings));
    }
    global ||= node.type === AST_NODE_TYPES.Identifier && node.name === 'APP_GUARD';
    global ||=
      node.type === AST_NODE_TYPES.MemberExpression &&
      !node.computed &&
      nameOf(node.property) === 'useGlobalGuards';
    global ||= appliesAuthMiddleware(node);
  });
  return { handlers, global };
}
