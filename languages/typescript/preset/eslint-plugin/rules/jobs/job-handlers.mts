import { importedBindings } from '../security/imported-names.mts';

const SCHEDULE_MODULE = '@nestjs/schedule';
const BULLMQ_MODULE = '@nestjs/bullmq';
const DECORATORS = new Map([
  ['Cron', [SCHEDULE_MODULE]],
  ['Interval', [SCHEDULE_MODULE]],
  ['Timeout', [SCHEDULE_MODULE]],
  ['Process', ['@nestjs/bull', BULLMQ_MODULE]],
]);
const PROCESSOR_MODULES = ['@nestjs/bull', BULLMQ_MODULE];

function decoratorName(decorator) {
  const { expression } = decorator;
  const callee = expression.type === 'CallExpression' ? expression.callee : expression;
  return callee.type === 'Identifier' ? callee.name : undefined;
}

function decoratedWith(node, names, bindings) {
  return (node.decorators ?? [])
    .map(decoratorName)
    .filter((name) => names.has(name))
    .find((name) => names.get(name).includes(bindings.get(name)?.module));
}

function methodJob(method, bindings) {
  const decorator = decoratedWith(method, DECORATORS, bindings);
  if (decorator !== undefined) {
    return `@${decorator}`;
  }
  const owner = method.parent.parent;
  const isProcessor =
    method.key.name === 'process' &&
    (decoratedWith(owner, new Map([['Processor', PROCESSOR_MODULES]]), bindings) !== undefined ||
      bindings.get(owner.superClass?.name)?.module === BULLMQ_MODULE);
  return isProcessor ? 'queue processor `process`' : undefined;
}

function callbackJob(fn, bindings) {
  const call = fn.parent;
  if (call.type === 'NewExpression') {
    const worker = call.callee.type === 'Identifier' && call.callee.name === 'Worker';
    return worker &&
      call.arguments[1] === fn &&
      ['bullmq', 'bull'].includes(bindings.get('Worker')?.module)
      ? 'queue worker'
      : undefined;
  }
  const { callee } = call;
  const member = call.type === 'CallExpression' && callee.type === 'MemberExpression';
  if (!member || callee.computed || call.arguments[1] !== fn) {
    return undefined;
  }
  const modules = new Set([...bindings.values()].map(({ module }) => module));
  if (callee.property.name === 'define' && modules.has('agenda')) {
    return 'Agenda job';
  }
  const root = callee.object.type === 'Identifier' ? bindings.get(callee.object.name) : undefined;
  return callee.property.name === 'schedule' && root?.module === 'node-cron'
    ? 'node-cron task'
    : undefined;
}

export function jobKind(fn, program) {
  const bindings = importedBindings(program);
  const isMethod = fn.parent.type === 'MethodDefinition' && fn.parent.value === fn;
  return isMethod ? methodJob(fn.parent, bindings) : callbackJob(fn, bindings);
}
