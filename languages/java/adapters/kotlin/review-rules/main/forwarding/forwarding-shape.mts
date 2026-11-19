import type { FunctionFact } from '../../typed/kotlin-fact-types.mts';

const SKIPPED_MODIFIERS = new Set([
  'override',
  'operator',
  'infix',
  'inline',
  'open',
  'abstract',
  'actual',
  'expect',
]);

export function isPlainForwarder(fn: FunctionFact, skippedNames: Set<string>): boolean {
  return (
    !fn.local &&
    (fn.annotations ?? []).length === 0 &&
    !fn.typeParameters &&
    fn.receiver === undefined &&
    fn.parameters.length > 0 &&
    fn.forward !== undefined &&
    !skippedNames.has(fn.name) &&
    !fn.modifiers.some((modifier) => SKIPPED_MODIFIERS.has(modifier)) &&
    fn.parameters.every(({ vararg, default: hasDefault }) => !(vararg || hasDefault))
  );
}

export function forwardsArguments(fn: FunctionFact): boolean {
  const { forward } = fn;
  return (
    forward !== undefined &&
    forward.arguments.length === fn.parameters.length &&
    forward.arguments.every(
      (argument, index) =>
        !argument.spread &&
        !argument.lambda &&
        argument.text === fn.parameters[index]?.name &&
        (argument.name === undefined || argument.name === fn.parameters[index].name),
    )
  );
}
