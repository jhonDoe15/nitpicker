import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { resolveConstant, stringValue } from '../analysis/constant-resolution.mjs';
import { isTypeWrapper, memberName, typeServices } from '../security/security-values.mjs';
import { calledName, importedName, moduleOfFile } from './emitter-creations.mjs';
import {
  CHAINABLE_METHODS,
  CONSUMING_METHODS,
  HANDLING_CALLS,
  HANDLING_LIBRARIES,
  HANDLING_STATICS,
  HELPER_HANDLING_NAMES,
  LISTEN_METHODS,
  STREAM_WAITERS,
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
  let current = node;
  while (isTypeWrapper(current.parent) && current.parent.expression === current) {
    current = current.parent;
  }
  return current;
}

function isErrorEvent(context, node) {
  return stringValue(resolveConstant(context, node)) === 'error';
}

function methodCall(member) {
  const call = member.parent;
  return call?.type === 'CallExpression' && call.callee === member ? call : undefined;
}

function chainHandles(context, firstCall) {
  let call = firstCall;
  while (call !== undefined) {
    const method = memberName(call.callee);
    if (LISTEN_METHODS.has(method) && isErrorEvent(context, call.arguments[0])) {
      return true;
    }
    if (!CHAINABLE_METHODS.has(method)) {
      return false;
    }
    const next = outerOf(call).parent;
    call = next?.type === 'MemberExpression' && next.object === outerOf(call) ? methodCall(next) : undefined;
  }
  return false;
}

function receiverOutcome(context, member) {
  const call = methodCall(member);
  if (call === undefined) {
    return 'neutral';
  }
  return chainHandles(context, call) || CONSUMING_METHODS.has(memberName(member))
    ? 'handled'
    : 'neutral';
}

function handlingCall(context, call, bindingsFor) {
  const direct = HANDLING_CALLS.some((entry) =>
    entry.names.has(calledName(context, call, bindingsFor(entry.modules))),
  );
  const { callee } = call;
  const isStatic =
    callee.type === 'MemberExpression' &&
    HANDLING_STATICS.some(
      (entry) =>
        entry.names.has(memberName(callee)) &&
        importedName(context, callee.object, bindingsFor(entry.modules)) === entry.owner,
    );
  return direct || isStatic;
}

function tsReceiver(node) {
  let current = node.expression;
  while (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression) &&
    CHAINABLE_METHODS.has(current.expression.name.text)
  ) {
    current = current.expression.expression;
  }
  return current;
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
  if (!HELPER_HANDLING_NAMES.has(callee)) {
    return false;
  }
  return STREAM_WAITERS.has(callee)
    ? node.arguments.some((argument) => isNamed(argument, name))
    : isNamed(node.arguments[0], name);
}

function tsListens(node, name) {
  const callee = node.expression;
  const event = node.arguments[0];
  return (
    ts.isPropertyAccessExpression(callee) &&
    LISTEN_METHODS.has(callee.name.text) &&
    event !== undefined &&
    ts.isStringLiteralLike(event) &&
    event.text === 'error' &&
    isNamed(tsReceiver(callee), name)
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

function helperOutcome(context, call, index) {
  const services = typeServices(context);
  const tsCall = services?.esTreeNodeToTSNodeMap.get(call);
  const declaration =
    tsCall === undefined ? undefined : services.program.getTypeChecker().getResolvedSignature(tsCall)?.declaration;
  const fileName = declaration?.getSourceFile().fileName;
  if (fileName === undefined) {
    return 'neutral';
  }
  const library = moduleOfFile(fileName);
  if (library !== undefined || declaration.getSourceFile().isDeclarationFile) {
    return HANDLING_LIBRARIES.has(library) ? 'handled' : 'neutral';
  }
  const parameter = declaration.parameters?.[index];
  const named = parameter !== undefined && ts.isIdentifier(parameter.name);
  return named && declaration.body !== undefined && tsHandles(declaration.body, parameter.name.text)
    ? 'handled'
    : 'neutral';
}

function argumentOutcome(context, call, argument, bindingsFor) {
  if (handlingCall(context, call, bindingsFor)) {
    return 'handled';
  }
  const index = call.arguments.indexOf(argument);
  return index === -1 ? 'neutral' : helperOutcome(context, call, index);
}

function wrappedArgumentOutcome(context, property, bindingsFor) {
  const object = property.parent;
  const call = object?.parent;
  const isArgument = CALLS.has(call?.type) && call.arguments.includes(object);
  return isArgument && handlingCall(context, call, bindingsFor) ? 'handled' : 'neutral';
}

export function referenceOutcome(context, reference, bindingsFor) {
  const node = outerOf(reference);
  const { parent } = node;
  if (parent.type === 'MemberExpression' && parent.object === node) {
    return receiverOutcome(context, parent);
  }
  if (parent.type === 'ForOfStatement' && parent.await && parent.right === node) {
    return 'handled';
  }
  if (CALLS.has(parent.type) && parent.callee !== node) {
    return argumentOutcome(context, parent, node, bindingsFor);
  }
  if (parent.type === 'Property' && parent.value === node) {
    return wrappedArgumentOutcome(context, parent, bindingsFor);
  }
  return ESCAPES.has(parent.type) && parent[ESCAPES.get(parent.type)] === node ? 'escaped' : 'neutral';
}

export function referencesOutcome(context, references, bindingsFor) {
  const outcomes = new Set(references.map((reference) => referenceOutcome(context, reference, bindingsFor)));
  if (outcomes.has('handled')) {
    return 'handled';
  }
  return outcomes.has('escaped') ? 'escaped' : 'unhandled';
}
