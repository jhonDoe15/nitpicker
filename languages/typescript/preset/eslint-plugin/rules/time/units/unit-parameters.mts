import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveFunction,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { ts } from '../../typed/typescript-views.mts';
import { hasTypeInformation } from '../time-views.mts';
import { argumentUnitOfCallName, unitOfName, type Unit } from './unit-views.mts';
import { calleeText, unwrap } from './unit-nodes.mts';

export type ParameterUnit = { readonly index: number; readonly unit: Unit; readonly name: string };
type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;

const { DefinitionType } = TSESLint.Scope;

const TIMER_CALLS = new Set(['setTimeout', 'setInterval']);
const PROMISE_TIMERS = new Set(['timers/promises', 'node:timers/promises']);
const DELAY = 'delay';

function importSource(definition: TSESLint.Scope.Definition): string | undefined {
  return definition.type === DefinitionType.ImportBinding &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration
    ? definition.parent.source.value
    : undefined;
}

function timerParameter(
  context: SourceContext,
  call: CallLike,
  text: string,
): ParameterUnit | undefined {
  const [first = '', second] = text.split('.');
  const owner = second === undefined ? undefined : first;
  const name = second ?? first;
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
  return PROMISE_TIMERS.has(importSource(definition) ?? '')
    ? { index: 0, unit: 'ms', name: DELAY }
    : undefined;
}

function knownParameters(
  context: SourceContext,
  call: CallLike,
  text: string,
): ParameterUnit[] | undefined {
  if (call.type === AST_NODE_TYPES.NewExpression) {
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
  const last = text.split('.').at(-1) ?? '';
  const unit = argumentUnitOfCallName(last);
  return unit === undefined ? undefined : [{ index: 0, unit, name: last }];
}

function parameterName(parameter: TSESTree.Parameter): string | undefined {
  if (parameter.type === AST_NODE_TYPES.Identifier) {
    return parameter.name;
  }
  return parameter.type === AST_NODE_TYPES.AssignmentPattern &&
    parameter.left.type === AST_NODE_TYPES.Identifier
    ? parameter.left.name
    : undefined;
}

function withUnits(names: readonly string[]): ParameterUnit[] {
  return names.flatMap((name, index) => {
    const unit = unitOfName(name);
    return unit === undefined ? [] : [{ index, name, unit }];
  });
}

function typedNames(context: SourceContext, call: CallLike): string[] {
  const services = context.sourceCode.parserServices;
  if (!hasTypeInformation(services)) {
    return [];
  }
  const tsNode = services.esTreeNodeToTSNodeMap.get(call);
  const signature = services.program.getTypeChecker().getResolvedSignature(tsNode);
  return (signature?.parameters ?? [])
    .filter((symbol) => {
      const declaration = symbol.valueDeclaration;
      return !(
        declaration !== undefined &&
        ts.isParameter(declaration) &&
        declaration.dotDotDotToken !== undefined
      );
    })
    .map((symbol) => symbol.name);
}

export function parameterUnits(context: SourceContext, call: CallLike): ParameterUnit[] {
  const text = calleeText(call.callee) ?? '';
  const known = knownParameters(context, call, text);
  if (known !== undefined) {
    return known;
  }
  const local = resolveFunction(context, unwrap(call.callee));
  if (local !== undefined) {
    return withUnits(local.params.map((parameter) => parameterName(parameter) ?? ''));
  }
  return withUnits(typedNames(context, call));
}
