const CONDITIONALS = new Set(['NegateConditionalsMutator', 'ConditionalsBoundaryMutator']);
const SUSPEND_METHOD_END = 'Lkotlin/coroutines/Continuation;)Ljava/lang/Object;';

export function isConditional({ mutatorName }) {
  return CONDITIONALS.has(mutatorName);
}

export function isReturn({ mutatorName }) {
  return mutatorName.includes('Return');
}

export function isSuspendContext({ method, methodDescription }) {
  return method === 'invokeSuspend' || methodDescription.endsWith(SUSPEND_METHOD_END);
}

export function unmangled(method) {
  return method.replace(/-.*$/, '').replace(/\$[A-Za-z_]\w*$/, '');
}

export function jvmNameOf(entry) {
  return entry.jvmName ?? entry.name;
}

export function within(entry, line) {
  return line >= entry.start && line <= entry.end;
}
