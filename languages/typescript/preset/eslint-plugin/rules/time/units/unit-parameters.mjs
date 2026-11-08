import { findVariable, isFunctionNode } from '../../analysis/constant-resolution.mjs';
import {
  argumentUnitOfCallName,
  unitOfName,
} from '../../../../../../../shared/naming/time-units/unit-names.mjs';
import { calleeText, unwrap } from './unit-values.mjs';

const TIMER_CALLS = new Set(['setTimeout', 'setInterval']);
const PROMISE_TIMERS = new Set(['timers/promises', 'node:timers/promises']);
const DELAY = 'delay';

function importSource(definition) {
  return definition?.type === 'ImportBinding' ? definition.parent.source.value : undefined;
}

function timerParameter(context, call, text) {
  const [owner, name] = text.includes('.') ? text.split('.') : [undefined, text];
  if (
    !TIMER_CALLS.has(name) ||
    (owner !== undefined && owner !== 'globalThis' && owner !== 'window')
  ) {
    return undefined;
  }
  if (owner !== undefined) {
    return { index: 1, unit: 'ms', name: DELAY };
  }
  const definition = findVariable(context, call.callee, name)?.defs[0];
  if (definition === undefined) {
    return { index: 1, unit: 'ms', name: DELAY };
  }
  return PROMISE_TIMERS.has(importSource(definition))
    ? { index: 0, unit: 'ms', name: DELAY }
    : undefined;
}

function knownParameters(context, call, text) {
  if (call.type === 'NewExpression') {
    return text === 'Date' && call.arguments.length === 1
      ? [{ index: 0, unit: 'ms', name: 'value' }]
      : undefined;
  }
  if (text === 'AbortSignal.timeout') {
    return [{ index: 0, unit: 'ms', name: 'milliseconds' }];
  }
  const timer = timerParameter(context, call, text);
  if (timer !== undefined) {
    return [timer];
  }
  const unit = argumentUnitOfCallName(text.split('.').at(-1));
  return unit === undefined ? undefined : [{ index: 0, unit, name: text.split('.').at(-1) }];
}

function parameterName(parameter) {
  if (parameter.type === 'Identifier') {
    return parameter.name;
  }
  return parameter.type === 'AssignmentPattern' && parameter.left.type === 'Identifier'
    ? parameter.left.name
    : undefined;
}

function withUnits(names) {
  return names
    .map((name, index) => ({ index, name, unit: unitOfName(name) }))
    .filter(({ unit }) => unit !== undefined);
}

function localFunction(context, callee) {
  const target = unwrap(callee);
  if (target?.type !== 'Identifier') {
    return undefined;
  }
  const definition = findVariable(context, target, target.name)?.defs[0];
  if (definition?.type === 'FunctionName') {
    return definition.node;
  }
  const init = definition?.type === 'Variable' ? definition.node.init : undefined;
  return isFunctionNode(init) ? init : undefined;
}

function typedNames(context, call) {
  const services = context.sourceCode.parserServices;
  if (services?.program === null || services?.program === undefined) {
    return [];
  }
  const tsNode = services.esTreeNodeToTSNodeMap.get(call);
  const signature = services.program.getTypeChecker().getResolvedSignature(tsNode);
  return (signature?.parameters ?? [])
    .filter((symbol) => symbol.valueDeclaration?.dotDotDotToken === undefined)
    .map((symbol) => symbol.name);
}

export function parameterUnits(context, call) {
  const text = calleeText(call.callee) ?? '';
  const known = knownParameters(context, call, text);
  if (known !== undefined) {
    return known;
  }
  const local = localFunction(context, call.callee);
  if (local !== undefined) {
    return withUnits(local.params.map((parameter) => parameterName(parameter) ?? ''));
  }
  return withUnits(typedNames(context, call));
}
