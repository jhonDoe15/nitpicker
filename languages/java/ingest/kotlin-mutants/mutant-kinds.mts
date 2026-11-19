import type { Mutant } from './typed/fact-types.mts';

type JvmNamed = { readonly jvmName: string | undefined; readonly name: string };
type Span = { readonly start: number; readonly end: number };

const CONDITIONALS = new Set(['NegateConditionalsMutator', 'ConditionalsBoundaryMutator']);
const SUSPEND_METHOD_END = 'Lkotlin/coroutines/Continuation;)Ljava/lang/Object;';

export function isConditional({ mutatorName }: Pick<Mutant, 'mutatorName'>): boolean {
  return CONDITIONALS.has(mutatorName) || mutatorName.startsWith('RemoveConditionalMutator_');
}

export function isSwitch({ mutatorName }: Pick<Mutant, 'mutatorName'>): boolean {
  return mutatorName === 'SwitchMutator' || mutatorName.startsWith('RemoveSwitchMutator_');
}

export function isReturn({ mutatorName }: Pick<Mutant, 'mutatorName'>): boolean {
  return mutatorName.includes('Return');
}

export function isSuspendContext({
  method,
  methodDescription,
}: Pick<Mutant, 'method' | 'methodDescription'>): boolean {
  return method === 'invokeSuspend' || methodDescription.endsWith(SUSPEND_METHOD_END);
}

export function unmangled(method: string): string {
  return method.replace(/-.*$/, '').replace(/\$[A-Za-z_]\w*$/, '');
}

export function jvmNameOf(entry: JvmNamed): string {
  return entry.jvmName ?? entry.name;
}

export function within(entry: Span, line: number): boolean {
  return line >= entry.start && line <= entry.end;
}
