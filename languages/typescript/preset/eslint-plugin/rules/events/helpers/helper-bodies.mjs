import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { chainOf } from '../../analysis/ancestry.mjs';
import { moduleOfFile } from '../emitter-creations.mjs';
import {
  isChainableMethod,
  isHandlingLibrary,
  isHelperHandlingName,
  isListenMethod,
  isStreamWaiter,
} from '../emitter-modules.mjs';

const MAX_DEPTH = 3;

function chainedReceiver(expression) {
  return chainOf(expression, (current) =>
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression) &&
    isChainableMethod(current.expression.name.text)
      ? current.expression.expression
      : undefined,
  ).at(-1);
}

function tsNameOf(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
}

function isTarget(node, target) {
  if (node === undefined) {
    return false;
  }
  if (ts.isIdentifier(node)) {
    return node.text === target.name;
  }
  return (
    target.field &&
    ts.isPropertyAccessExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ThisKeyword &&
    node.name.text === target.name
  );
}

function passes(node, target) {
  const callee = tsNameOf(node.expression);
  if (!isHelperHandlingName(callee)) {
    return false;
  }
  return isStreamWaiter(callee)
    ? node.arguments.some((argument) => isTarget(argument, target))
    : isTarget(node.arguments[0], target);
}

function listens(node, target) {
  const callee = node.expression;
  const event = node.arguments[0];
  return (
    ts.isPropertyAccessExpression(callee) &&
    isListenMethod(callee.name.text) &&
    event !== undefined &&
    ts.isStringLiteralLike(event) &&
    event.text === 'error' &&
    isTarget(chainedReceiver(callee.expression), target)
  );
}

function isCall(node) {
  return ts.isCallExpression(node) || ts.isNewExpression(node);
}

function handlesNode(node, target) {
  if (ts.isForOfStatement(node) && node.awaitModifier !== undefined) {
    return isTarget(node.expression, target);
  }
  return ts.isCallExpression(node) && (passes(node, target) || listens(node, target));
}

function delegation(checker, node, { target, depth }) {
  const index = isCall(node)
    ? (node.arguments?.findIndex((argument) => isTarget(argument, target)) ?? -1)
    : -1;
  return index === -1
    ? []
    : [{ declaration: checker.getResolvedSignature(node)?.declaration, index, depth: depth + 1 }];
}

function inspectBody(checker, root, scope) {
  const pending = [root];
  const next = [];
  for (const node of pending) {
    if (handlesNode(node, scope.target)) {
      return { handled: true, next };
    }
    next.push(...delegation(checker, node, scope));
    ts.forEachChild(node, (child) => {
      pending.push(child);
    });
  }
  return { handled: false, next };
}

function parameterTarget(declaration, parameter) {
  const field = ts.isParameterPropertyDeclaration(parameter, declaration);
  return {
    target: { name: parameter.name.text, field },
    root: field ? declaration.parent : declaration.body,
  };
}

function inspect(checker, { declaration, index, depth }) {
  const source = declaration?.getSourceFile();
  if (source === undefined) {
    return { handled: false, next: [] };
  }
  const library = moduleOfFile(source.fileName);
  if (library !== undefined || source.isDeclarationFile) {
    return { handled: isHandlingLibrary(library), next: [] };
  }
  const parameter = declaration.parameters?.[index];
  const readable =
    parameter !== undefined && ts.isIdentifier(parameter.name) && declaration.body !== undefined;
  if (!readable) {
    return { handled: false, next: [] };
  }
  const { target, root } = parameterTarget(declaration, parameter);
  return inspectBody(checker, root, { target, depth });
}

export function helperOutcome(services, call, index) {
  const tsCall = services.esTreeNodeToTSNodeMap.get(call);
  const checker = services.program.getTypeChecker();
  const pending = [
    {
      declaration:
        tsCall === undefined ? undefined : checker.getResolvedSignature(tsCall)?.declaration,
      index,
      depth: 0,
    },
  ];
  for (const item of pending) {
    const { handled, next } = inspect(checker, item);
    if (handled) {
      return 'handled';
    }
    pending.push(...next.filter((entry) => entry.depth <= MAX_DEPTH));
  }
  return 'neutral';
}
