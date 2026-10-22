import path from 'node:path';
import ts from 'typescript';
import { decoratorNames, isNestController } from '../contracts/decorators.mjs';
import { infrastructureOf, packageOf } from '../contracts/infrastructure-types.mjs';
import { entitiesIn } from './orm-entities.mjs';
import { callSignatureTypes, typeSymbols } from '../contracts/type-walk.mjs';

const NEST_ROUTES = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Head', 'Options', 'Sse'];
const ROUTE_FILE = /^route\.[cm]?[jt]sx?$/u;
const HTTP_VERBS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const SEND_METHODS = new Set(['json', 'send']);
const STATIC_SENDERS = new Set(['NextResponse', 'Response']);

function reportEntities({ context, checker }, { node, site, types }) {
  const reported = new Set();
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

function signatureTypes(checker, declaration) {
  const signature = checker.getSignatureFromDeclaration(declaration);
  if (signature === undefined) {
    return [];
  }
  const { parameters, returns } = callSignatureTypes(checker, signature);
  return [...parameters, returns];
}

function isTransportObject(checker, expression) {
  return typeSymbols(checker.getTypeAtLocation(expression)).some(
    (symbol) => infrastructureOf(symbol)?.kind === 'transport',
  );
}

function isStaticSender(checker, expression) {
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
      file.hasNoDefaultLib ||
      packageOf(file.fileName) === 'typescript')
  );
}

function sendTarget(checker, tsCall) {
  const callee = tsCall.expression;
  if (!ts.isPropertyAccessExpression(callee) || !SEND_METHODS.has(callee.name.text)) {
    return false;
  }
  return (
    isTransportObject(checker, callee.expression) || isStaticSender(checker, callee.expression)
  );
}

function nestRoute(checker, method) {
  const owner = method.parent;
  return (
    ts.isClassLike(owner) &&
    isNestController(checker, owner) &&
    decoratorNames(checker, method, ['@nestjs/common']).some((name) => NEST_ROUTES.includes(name))
  );
}

function routeExportName(node) {
  if (node.type === 'FunctionDeclaration') {
    return node.id?.name;
  }
  return node.type === 'VariableDeclarator' && node.id.type === 'Identifier'
    ? node.id.name
    : undefined;
}

function tsNode(scope, node) {
  return scope.services.esTreeNodeToTSNodeMap.get(node);
}

function isExported(node) {
  return (
    node.parent?.type === 'ExportNamedDeclaration' ||
    node.parent?.parent?.type === 'ExportNamedDeclaration'
  );
}

function routeHandler(scope, node, declaration) {
  const name = routeExportName(node);
  if (scope.routeFile && isExported(node) && HTTP_VERBS.has(name)) {
    reportEntities(scope, {
      node: node.id,
      site: name,
      types: signatureTypes(scope.checker, declaration),
    });
  }
}

function visitMethod(scope, node) {
  const method = tsNode(scope, node);
  if (nestRoute(scope.checker, method)) {
    reportEntities(scope, {
      node: node.key,
      site: `${method.parent.name?.text ?? 'controller'}.${method.name.getText()}`,
      types: signatureTypes(scope.checker, method),
    });
  }
}

function visitVariable(scope, node) {
  const initializer = node.init === null ? undefined : tsNode(scope, node.init);
  if (initializer !== undefined && ts.isFunctionLike(initializer)) {
    routeHandler(scope, node, initializer);
  }
}

function visitCall(scope, node) {
  const call = tsNode(scope, node);
  if (call.arguments.length > 0 && sendTarget(scope.checker, call)) {
    reportEntities(scope, {
      node: node.arguments[0],
      site: `${call.expression.getText()}(...)`,
      types: [scope.checker.getTypeAtLocation(call.arguments[0])],
    });
  }
}

function visitAssignment(scope, node) {
  const left = tsNode(scope, node.left);
  if (
    ts.isPropertyAccessExpression(left) &&
    left.name.text === 'body' &&
    isTransportObject(scope.checker, left.expression)
  ) {
    reportEntities(scope, {
      node: node.right,
      site: `${left.getText()} =`,
      types: [scope.checker.getTypeAtLocation(tsNode(scope, node.right))],
    });
  }
}

function createVisitors(context, services) {
  const scope = {
    context,
    services,
    checker: services.program.getTypeChecker(),
    routeFile: ROUTE_FILE.test(path.basename(context.filename)),
  };
  return {
    MethodDefinition(node) {
      visitMethod(scope, node);
    },
    FunctionDeclaration(node) {
      routeHandler(scope, node, tsNode(scope, node));
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

export const rule = {
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
    const services = context.sourceCode.parserServices;
    return services?.program ? createVisitors(context, services) : {};
  },
};
