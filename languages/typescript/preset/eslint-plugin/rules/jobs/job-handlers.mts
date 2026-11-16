import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { importedBindings, type ImportedBinding } from '../security/imported-names.mts';
import { nameOf } from '../typed/node-views.mts';
import type { Callback } from '../typed/syntax-views.mts';

type Bindings = Map<string, ImportedBinding>;
type Candidates = ReadonlyMap<string, readonly string[]>;

const SCHEDULE_MODULE = '@nestjs/schedule';
const BULLMQ_MODULE = '@nestjs/bullmq';
const DECORATORS: Candidates = new Map([
  ['Cron', [SCHEDULE_MODULE]],
  ['Interval', [SCHEDULE_MODULE]],
  ['Timeout', [SCHEDULE_MODULE]],
  ['Process', ['@nestjs/bull', BULLMQ_MODULE]],
]);
const PROCESSOR_MODULES = ['@nestjs/bull', BULLMQ_MODULE];

function decoratorName(decorator: TSESTree.Decorator): string | undefined {
  const { expression } = decorator;
  const callee = expression.type === AST_NODE_TYPES.CallExpression ? expression.callee : expression;
  return callee.type === AST_NODE_TYPES.Identifier ? callee.name : undefined;
}

function decoratedWith(
  node: TSESTree.MethodDefinition | TSESTree.ClassDeclaration | TSESTree.ClassExpression,
  names: Candidates,
  bindings: Bindings,
): string | undefined {
  return node.decorators
    .map(decoratorName)
    .filter((name) => name !== undefined)
    .find((name) => names.get(name)?.includes(bindings.get(name)?.module ?? '') === true);
}

function methodJob(method: TSESTree.MethodDefinition, bindings: Bindings): string | undefined {
  const decorator = decoratedWith(method, DECORATORS, bindings);
  if (decorator !== undefined) {
    return `@${decorator}`;
  }
  const owner = method.parent.parent;
  const isProcessor =
    nameOf(method.key) === 'process' &&
    (decoratedWith(owner, new Map([['Processor', PROCESSOR_MODULES]]), bindings) !== undefined ||
      bindings.get(nameOf(owner.superClass) ?? '')?.module === BULLMQ_MODULE);
  return isProcessor ? 'queue processor `process`' : undefined;
}

function callbackJob(fn: Callback, bindings: Bindings): string | undefined {
  const call = fn.parent;
  if (call.type === AST_NODE_TYPES.NewExpression) {
    const worker = call.callee.type === AST_NODE_TYPES.Identifier && call.callee.name === 'Worker';
    return worker &&
      call.arguments[1] === fn &&
      ['bullmq', 'bull'].includes(bindings.get('Worker')?.module ?? '')
      ? 'queue worker'
      : undefined;
  }
  if (
    call.type !== AST_NODE_TYPES.CallExpression ||
    call.callee.type !== AST_NODE_TYPES.MemberExpression ||
    call.callee.computed ||
    call.arguments[1] !== fn
  ) {
    return undefined;
  }
  const { callee } = call;
  const method = nameOf(callee.property);
  const modules = new Set([...bindings.values()].map(({ module }) => module));
  if (method === 'define' && modules.has('agenda')) {
    return 'Agenda job';
  }
  const root =
    callee.object.type === AST_NODE_TYPES.Identifier ? bindings.get(callee.object.name) : undefined;
  return method === 'schedule' && root?.module === 'node-cron' ? 'node-cron task' : undefined;
}

export function jobKind(fn: Callback, program: TSESTree.Program): string | undefined {
  const bindings = importedBindings(program);
  const { parent } = fn;
  return parent.type === AST_NODE_TYPES.MethodDefinition && parent.value === fn
    ? methodJob(parent, bindings)
    : callbackJob(fn, bindings);
}
