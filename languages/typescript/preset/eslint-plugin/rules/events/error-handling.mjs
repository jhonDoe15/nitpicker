import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { chainOf } from '../analysis/ancestry.mjs';
import { resolveConstant, stringValue } from '../analysis/constant-resolution.mjs';
import { isTypeWrapper, memberName, typeServices } from '../security/security-values.mjs';
import { calledName, importedName, moduleOfFile } from './emitter-creations.mjs';
import {
  HANDLING_CALLS,
  HANDLING_STATICS,
  isChainableMethod,
  isConsumingMethod,
  isHandlingLibrary,
  isHelperHandlingName,
  isListenMethod,
  isStreamWaiter,
} from './emitter-modules.mjs';

const ESCAPES = new Map([
  ['ReturnStatement', 'argument'],
  ['YieldExpression', 'argument'],
  ['ArrowFunctionExpression', 'body'],
  ['AssignmentExpression', 'right'],
  ['VariableDeclarator', 'init'],
  ['ExportDefaultDeclaration', 'declaration'],
  ['ExportSpecifier', 'local'],
  ['SpreadElement', 'argument'],
]);
const CALLS = new Set(['CallExpression', 'NewExpression']);

function outerOf(node) {
  return chainOf(node, (current) =>
    isTypeWrapper(current.parent) && current.parent.expression === current
      ? current.parent
      : undefined,
  ).at(-1);
}

function methodCall(member) {
  const call = member?.parent;
  return call?.type === 'CallExpression' && call.callee === member ? call : undefined;
}

function nextChainedCall(call) {
  if (!isChainableMethod(memberName(call.callee))) {
    return undefined;
  }
  const outer = outerOf(call);
  const next = outer.parent;
  return next?.type === 'MemberExpression' && next.object === outer ? methodCall(next) : undefined;
}

function listensForErrors(context, call) {
  const event = stringValue(resolveConstant(context, call.arguments[0]));
  return isListenMethod(memberName(call.callee)) && event === 'error';
}

function receiverOutcome(context, member) {
  const calls = chainOf(methodCall(member), nextChainedCall);
  const handled =
    calls.some((call) => listensForErrors(context, call)) ||
    (calls.length > 0 && isConsumingMethod(memberName(member)));
  return handled ? 'handled' : 'neutral';
}

function isStaticHandler(scope, callee) {
  return (
    callee.type === 'MemberExpression' &&
    HANDLING_STATICS.some(
      (entry) =>
        entry.names.has(memberName(callee)) &&
        importedName(scope.context, callee.object, scope.bindingsFor(entry.modules)) ===
          entry.owner,
    )
  );
}

function isHandlingCall(scope, call) {
  const direct = HANDLING_CALLS.some((entry) =>
    entry.names.has(calledName(scope.context, call, scope.bindingsFor(entry.modules))),
  );
  return direct || isStaticHandler(scope, call.callee);
}

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

function isNamed(node, name) {
  return node !== undefined && ts.isIdentifier(node) && node.text === name;
}

function tsPasses(node, name) {
  const callee = tsNameOf(node.expression);
  if (!isHelperHandlingName(callee)) {
    return false;
  }
  return isStreamWaiter(callee)
    ? node.arguments.some((argument) => isNamed(argument, name))
    : isNamed(node.arguments[0], name);
}

function tsListens(node, name) {
  const callee = node.expression;
  const event = node.arguments[0];
  return (
    ts.isPropertyAccessExpression(callee) &&
    isListenMethod(callee.name.text) &&
    event !== undefined &&
    ts.isStringLiteralLike(event) &&
    event.text === 'error' &&
    isNamed(chainedReceiver(callee.expression), name)
  );
}

function tsHandlesNode(node, name) {
  if (ts.isForOfStatement(node) && node.awaitModifier !== undefined) {
    return isNamed(node.expression, name);
  }
  return ts.isCallExpression(node) && (tsPasses(node, name) || tsListens(node, name));
}

function tsHandles(body, name) {
  const pending = [body];
  for (const node of pending) {
    if (tsHandlesNode(node, name)) {
      return true;
    }
    ts.forEachChild(node, (child) => {
      pending.push(child);
    });
  }
  return false;
}

function resolvedDeclaration(context, call) {
  const services = typeServices(context);
  const tsCall = services?.esTreeNodeToTSNodeMap.get(call);
  return tsCall === undefined
    ? undefined
    : services.program.getTypeChecker().getResolvedSignature(tsCall)?.declaration;
}

function helperOutcome(context, call, index) {
  const declaration = resolvedDeclaration(context, call);
  const source = declaration?.getSourceFile();
  if (source === undefined) {
    return 'neutral';
  }
  const library = moduleOfFile(source.fileName);
  if (library !== undefined || source.isDeclarationFile) {
    return isHandlingLibrary(library) ? 'handled' : 'neutral';
  }
  const parameter = declaration.parameters?.[index];
  const named = parameter !== undefined && ts.isIdentifier(parameter.name);
  const handles =
    named && declaration.body !== undefined && tsHandles(declaration.body, parameter.name.text);
  return handles ? 'handled' : 'neutral';
}

function argumentOutcome(scope, call, argument) {
  if (isHandlingCall(scope, call)) {
    return 'handled';
  }
  const index = call.arguments.indexOf(argument);
  return index === -1 ? 'neutral' : helperOutcome(scope.context, call, index);
}

function wrappedArgumentOutcome(scope, property) {
  const object = property.parent;
  const call = object?.parent;
  const isArgument = CALLS.has(call?.type) && call.arguments.includes(object);
  return isArgument && isHandlingCall(scope, call) ? 'handled' : 'neutral';
}

function escapeOutcome(parent, node) {
  return ESCAPES.has(parent.type) && parent[ESCAPES.get(parent.type)] === node
    ? 'escaped'
    : 'neutral';
}

function referenceOutcome(scope, reference) {
  const node = outerOf(reference);
  const { parent } = node;
  if (parent.type === 'MemberExpression' && parent.object === node) {
    return receiverOutcome(scope.context, parent);
  }
  if (parent.type === 'ForOfStatement' && parent.await && parent.right === node) {
    return 'handled';
  }
  if (CALLS.has(parent.type) && parent.callee !== node) {
    return argumentOutcome(scope, parent, node);
  }
  if (parent.type === 'Property' && parent.value === node) {
    return wrappedArgumentOutcome(scope, parent);
  }
  return escapeOutcome(parent, node);
}

export function referencesOutcome(scope, references) {
  const outcomes = new Set(references.map((reference) => referenceOutcome(scope, reference)));
  if (outcomes.has('handled')) {
    return 'handled';
  }
  return outcomes.has('escaped') ? 'escaped' : 'unhandled';
}
