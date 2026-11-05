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

function delegates(state, node, target) {
  const index = node.arguments.findIndex((argument) => isTarget(argument, target));
  if (index === -1 || state.depth >= MAX_DEPTH) {
    return false;
  }
  const declaration = state.checker.getResolvedSignature(node)?.declaration;
  return declarationHandles({ ...state, depth: state.depth + 1 }, declaration, index) === 'handled';
}

function handlesNode(state, node, target) {
  if (ts.isForOfStatement(node) && node.awaitModifier !== undefined) {
    return isTarget(node.expression, target);
  }
  const isCall = ts.isCallExpression(node) || ts.isNewExpression(node);
  return (
    isCall && (passes(node, target) || listens(node, target) || delegates(state, node, target))
  );
}

function handles(state, root, target) {
  const pending = [root];
  for (const node of pending) {
    if (handlesNode(state, node, target)) {
      return true;
    }
    ts.forEachChild(node, (child) => {
      pending.push(child);
    });
  }
  return false;
}

function parameterTarget(declaration, parameter) {
  const field = ts.isParameterPropertyDeclaration(parameter, declaration);
  return {
    target: { name: parameter.name.text, field },
    root: field ? declaration.parent : declaration.body,
  };
}

function declarationHandles(state, declaration, index) {
  const source = declaration?.getSourceFile();
  if (source === undefined) {
    return 'neutral';
  }
  const library = moduleOfFile(source.fileName);
  if (library !== undefined || source.isDeclarationFile) {
    return isHandlingLibrary(library) ? 'handled' : 'neutral';
  }
  const parameter = declaration.parameters?.[index];
  if (
    parameter === undefined ||
    !ts.isIdentifier(parameter.name) ||
    declaration.body === undefined
  ) {
    return 'neutral';
  }
  const { target, root } = parameterTarget(declaration, parameter);
  return handles(state, root, target) ? 'handled' : 'neutral';
}

export function helperOutcome(services, call, index) {
  const tsCall = services.esTreeNodeToTSNodeMap.get(call);
  const checker = services.program.getTypeChecker();
  const declaration =
    tsCall === undefined ? undefined : checker.getResolvedSignature(tsCall)?.declaration;
  return declarationHandles({ checker, depth: 0 }, declaration, index);
}
