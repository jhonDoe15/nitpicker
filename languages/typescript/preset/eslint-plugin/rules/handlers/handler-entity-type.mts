import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import path from 'node:path';
import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import { typeServices } from '../security/security-values.mts';
import { decoratorNames, isNestController } from '../contracts/decorators.mts';
import { infrastructureOf, packageOf } from '../contracts/infrastructure-types.mts';
import { entitiesIn } from './orm-entities.mts';
import { callSignatureTypes, typeSymbols } from '../contracts/type-walk.mts';

type Scope = {
  readonly context: Readonly<TSESLint.RuleContext<'entity', readonly []>>;
  readonly nodes: ParserServicesWithTypeInformation['esTreeNodeToTSNodeMap'];
  readonly checker: TypeScript.TypeChecker;
  readonly program: TypeScript.Program;
  readonly routeFile: boolean;
};
type Site = {
  readonly node: TSESTree.Node;
  readonly site: string;
  readonly types: readonly TypeScript.Type[];
};

const NEST_ROUTES = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Head', 'Options', 'Sse'];
const ROUTE_FILE = /^route\.[cm]?[jt]sx?$/u;
const HTTP_VERBS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const SEND_METHODS = new Set(['json', 'send']);
const STATIC_SENDERS = new Set(['NextResponse', 'Response']);

function reportEntities({ context, checker }: Scope, { node, site, types }: Site): void {
  const reported = new Set<string>();
  for (const entity of types.flatMap((type) => entitiesIn(checker, type))) {
    if (!reported.has(entity.name)) {
      reported.add(entity.name);
      context.report({
        node,
        messageId: 'entity',
        data: { site, entity: entity.name, orm: entity.orm },
      });
    }
  }
}

function signatureTypes(
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.SignatureDeclaration,
): TypeScript.Type[] {
  const signature = checker.getSignatureFromDeclaration(declaration);
  if (signature === undefined) {
    return [];
  }
  const { parameters, returns } = callSignatureTypes(checker, signature);
  return [...parameters, returns];
}

function isTransportObject(checker: TypeScript.TypeChecker, expression: TypeScript.Node): boolean {
  return typeSymbols(checker.getTypeAtLocation(expression)).some(
    (symbol) => infrastructureOf(symbol)?.kind === 'transport',
  );
}

function isStaticSender(program: TypeScript.Program, expression: TypeScript.Node): boolean {
  const checker = program.getTypeChecker();
  const symbol = checker.getSymbolAtLocation(expression);
  const target =
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const file = target?.declarations?.[0]?.getSourceFile();
  return (
    target !== undefined &&
    STATIC_SENDERS.has(target.name) &&
    file !== undefined &&
    (packageOf(file.fileName) === 'next' ||
      program.isSourceFileDefaultLibrary(file) ||
      packageOf(file.fileName) === 'typescript')
  );
}

function sendTarget(program: TypeScript.Program, tsCall: TypeScript.CallExpression): boolean {
  const callee = tsCall.expression;
  if (!(ts.isPropertyAccessExpression(callee) && SEND_METHODS.has(callee.name.text))) {
    return false;
  }
  return (
    isTransportObject(program.getTypeChecker(), callee.expression) ||
    isStaticSender(program, callee.expression)
  );
}

function nestRoute(checker: TypeScript.TypeChecker, method: TypeScript.Node): boolean {
  const owner = method.parent;
  return (
    ts.isClassLike(owner) &&
    isNestController(checker, owner) &&
    decoratorNames(checker, method, ['@nestjs/common']).some((name) => NEST_ROUTES.includes(name))
  );
}

function routeIdentifier(
  node: TSESTree.FunctionDeclaration | TSESTree.VariableDeclarator,
): TSESTree.Identifier | undefined {
  if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
    return node.id ?? undefined;
  }
  return node.id.type === AST_NODE_TYPES.Identifier ? node.id : undefined;
}

function isExported(node: TSESTree.Node): boolean {
  return (
    node.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    node.parent?.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration
  );
}

function routeHandler(
  scope: Scope,
  node: TSESTree.FunctionDeclaration | TSESTree.VariableDeclarator,
  declaration: TypeScript.SignatureDeclaration,
): void {
  const id = routeIdentifier(node);
  if (scope.routeFile && isExported(node) && id !== undefined && HTTP_VERBS.has(id.name)) {
    reportEntities(scope, {
      node: id,
      site: id.name,
      types: signatureTypes(scope.checker, declaration),
    });
  }
}

function visitMethod(scope: Scope, node: TSESTree.MethodDefinition): void {
  const method = scope.nodes.get(node);
  if (ts.isConstructorDeclaration(method) || !nestRoute(scope.checker, method)) {
    return;
  }
  const owner = method.parent;
  const ownerName = ts.isClassLike(owner) ? owner.name?.text : undefined;
  reportEntities(scope, {
    node: node.key,
    site: `${ownerName ?? 'controller'}.${method.name.getText()}`,
    types: signatureTypes(scope.checker, method),
  });
}

function visitVariable(scope: Scope, node: TSESTree.VariableDeclarator): void {
  const initializer = node.init === null ? undefined : scope.nodes.get(node.init);
  if (initializer !== undefined && ts.isFunctionLike(initializer)) {
    routeHandler(scope, node, initializer);
  }
}

function visitCall(scope: Scope, node: TSESTree.CallExpression): void {
  const call = scope.nodes.get(node);
  const [first] = node.arguments;
  const [tsFirst] = call.arguments;
  if (first !== undefined && tsFirst !== undefined && sendTarget(scope.program, call)) {
    reportEntities(scope, {
      node: first,
      site: `${call.expression.getText()}(...)`,
      types: [scope.checker.getTypeAtLocation(tsFirst)],
    });
  }
}

function visitAssignment(scope: Scope, node: TSESTree.AssignmentExpression): void {
  const left = scope.nodes.get(node.left);
  if (
    ts.isPropertyAccessExpression(left) &&
    left.name.text === 'body' &&
    isTransportObject(scope.checker, left.expression)
  ) {
    reportEntities(scope, {
      node: node.right,
      site: `${left.getText()} =`,
      types: [scope.checker.getTypeAtLocation(scope.nodes.get(node.right))],
    });
  }
}

function createVisitors(
  context: Scope['context'],
  services: ParserServicesWithTypeInformation,
): TSESLint.RuleListener {
  const scope: Scope = {
    context,
    nodes: services.esTreeNodeToTSNodeMap,
    checker: services.program.getTypeChecker(),
    program: services.program,
    routeFile: ROUTE_FILE.test(path.basename(context.filename)),
  };
  return {
    MethodDefinition(node) {
      visitMethod(scope, node);
    },
    FunctionDeclaration(node) {
      routeHandler(scope, node, scope.nodes.get(node));
    },
    VariableDeclarator(node) {
      visitVariable(scope, node);
    },
    CallExpression(node) {
      visitCall(scope, node);
    },
    AssignmentExpression(node) {
      visitAssignment(scope, node);
    },
  };
}

export const rule: TSESLint.RuleModule<
  'entity',
  readonly [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Keep ORM entities out of route handler signatures and response bodies',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      entity:
        'Take and return a plain record (DTO) in {{site}} and map {{entity}} to it in the service: {{entity}} is a {{orm}} entity, so the response serializes every column and loaded relation and ties the API to the database schema. An exception fits only when the entity is deliberately the API model, such as a read-only projection.',
    },
  },
  create(context) {
    const services = typeServices(context);
    return services === undefined ? {} : createVisitors(context, services);
  },
};
