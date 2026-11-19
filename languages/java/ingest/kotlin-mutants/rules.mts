import { outerClass } from '../class-names.mts';
import { generatedAccessor, generatedMember, valueClassMember } from './member-rules.mts';
import {
  isConditional,
  isReturn,
  isSuspendContext,
  isSwitch,
  jvmNameOf,
  unmangled,
  within,
} from './mutant-kinds.mts';
import type { FileFacts, LambdaFacts, MutantRule, RuleContext } from './typed/fact-types.mts';

const INTRINSICS_CALL = /^removed call to kotlin\/jvm\/internal\/Intrinsics::(\w+)$/;
const INLINE_MARKER_CALL = /^removed call to kotlin\/jvm\/internal\/InlineMarker::/;
const COMPOSE_CALL =
  /^removed call to androidx\/compose\/runtime\/(?:Composer|ComposerKt|ScopeUpdateScope|RecomposeScope)::/;
const MEMBER_ASSIGNMENT = /^Removed assignment to member variable (\S+)$/;
const SPILLED_VARIABLE = /^[A-Z]\$\d+$/;
const UNIT_BUILDERS = new Set([
  'launch',
  'flow',
  'channelFlow',
  'callbackFlow',
  'sequence',
  'iterator',
  'produce',
  'actor',
  'runTest',
  'launchIn',
  'onEach',
  'collect',
  'collectLatest',
  'forEach',
  'flowOn',
  'onStart',
  'onCompletion',
  'invokeOnCompletion',
]);

function inlineBody({ mutant, file }: RuleContext): boolean {
  const base = unmangled(mutant.method.replace(/(?:\$default|\$\$forInline)$/, ''));
  return (
    file !== undefined &&
    file.functions.some(
      (entry) =>
        entry.inline &&
        entry.class === mutant.className &&
        jvmNameOf(entry) === base &&
        (mutant.line > file.lines || within(entry, mutant.line)),
    )
  );
}

function inlinedBeyondFile({ mutant, file }: RuleContext): boolean {
  const owner = outerClass(mutant.className);
  return (
    file !== undefined &&
    mutant.line > file.lines &&
    !file.functions.some(
      (entry) => entry.inlineCalls.length > 0 && outerClass(entry.class) === owner,
    )
  );
}

function defaultStub({ mutant, file }: RuleContext): boolean {
  const stub =
    mutant.method.endsWith('$default') ||
    mutant.methodDescription.includes('DefaultConstructorMarker');
  return stub && isConditional(mutant) && file !== undefined && !file.branching.has(mutant.line);
}

function stateMachineBranch({ mutant, file }: RuleContext): boolean {
  return (
    (isConditional(mutant) || isSwitch(mutant)) &&
    isSuspendContext(mutant) &&
    file !== undefined &&
    !file.branching.has(mutant.line)
  );
}

function coroutineStateField({ mutant, cls }: RuleContext): boolean {
  const field = MEMBER_ASSIGNMENT.exec(mutant.description)?.[1];
  if (field === undefined || !isSuspendContext(mutant)) {
    return false;
  }
  if (SPILLED_VARIABLE.test(field)) {
    return true;
  }
  return (
    field === 'label' &&
    (mutant.method === 'invokeSuspend' ||
      !(cls?.properties ?? []).some(({ name }) => name === 'label'))
  );
}

function exhaustiveWhenLastBranch({ mutant, file }: RuleContext): boolean {
  return (
    mutant.mutatorName === 'RemoveConditionalMutator_EQUAL_IF' &&
    file?.exhaustiveLastEntries.has(mutant.line) === true
  );
}

function innermostLambda(file: FileFacts, line: number): LambdaFacts | undefined {
  return file.lambdas
    .filter((lambda) => line >= lambda.start && line <= lambda.end)
    .reduce<LambdaFacts | undefined>(
      (inner, lambda) =>
        inner === undefined ||
        lambda.start > inner.start ||
        (lambda.start === inner.start && lambda.end < inner.end)
          ? lambda
          : inner,
      undefined,
    );
}

function suspendLambdaResult({ mutant, file }: RuleContext): boolean {
  if (mutant.method !== 'invokeSuspend' || !isReturn(mutant) || file === undefined) {
    return false;
  }
  const lambda = innermostLambda(file, mutant.line);
  if (lambda === undefined) {
    return true;
  }
  if (lambda.returnLines.includes(mutant.line)) {
    return false;
  }
  return (
    !lambda.valueLines.includes(mutant.line) ||
    lambda.discarded ||
    lambda.unitCallee ||
    (!lambda.projectCallee && UNIT_BUILDERS.has(lambda.callee))
  );
}

function suspendUnitResult({ mutant, file }: RuleContext): boolean {
  return (
    isReturn(mutant) &&
    file !== undefined &&
    file.functions.some(
      (entry) =>
        entry.suspend &&
        entry.returnsUnit &&
        entry.class === mutant.className &&
        jvmNameOf(entry) === unmangled(mutant.method) &&
        within(entry, mutant.line),
    )
  );
}

function jvmStaticBridge({ mutant, file }: RuleContext): boolean {
  return (
    file !== undefined &&
    file.functions.some(
      (entry) =>
        entry.staticIn === mutant.className &&
        jvmNameOf(entry) === unmangled(mutant.method) &&
        within(entry, mutant.line),
    )
  );
}

function defaultImplsTwin({ mutant, siblings }: RuleContext): boolean {
  const suffix = '$DefaultImpls';
  return (
    mutant.className.endsWith(suffix) &&
    siblings.has(`${mutant.className.slice(0, -suffix.length)}|${mutant.method}`)
  );
}

function nullCheckIntrinsic({ mutant, file }: RuleContext): boolean {
  const call = INTRINSICS_CALL.exec(mutant.description);
  if (call === null) {
    return false;
  }
  return !(call[1] === 'checkNotNull' && file?.casts.has(mutant.line));
}

export const SOURCE_FREE_RULES: MutantRule[] = [
  [
    'coroutine-throw-on-failure',
    ({ mutant }: RuleContext): boolean =>
      mutant.description === 'removed call to kotlin/ResultKt::throwOnFailure' &&
      isSuspendContext(mutant),
  ],
  ['null-check-intrinsic', nullCheckIntrinsic],
  [
    'inline-marker',
    ({ mutant }: RuleContext): boolean => INLINE_MARKER_CALL.test(mutant.description),
  ],
  [
    'unit-result',
    ({ mutant }: RuleContext): boolean =>
      isReturn(mutant) && mutant.methodDescription.endsWith(')Lkotlin/Unit;'),
  ],
  ['default-impls-twin', defaultImplsTwin],
  [
    'when-mappings',
    ({ mutant, declared }: RuleContext): boolean =>
      mutant.className.endsWith('$WhenMappings') && !declared.has(mutant.className),
  ],
  ['synthetic-accessor', ({ mutant }: RuleContext): boolean => mutant.method.startsWith('access$')],
  [
    'serializer-class',
    ({ mutant }: RuleContext): boolean => mutant.className.endsWith('$$serializer'),
  ],
  [
    'compose-generated',
    ({ mutant }: RuleContext): boolean =>
      mutant.className.includes('ComposableSingletons$') || COMPOSE_CALL.test(mutant.description),
  ],
];

export const SOURCE_RULES: MutantRule[] = [
  ['state-machine-branch', stateMachineBranch],
  ['coroutine-state-field', coroutineStateField],
  ['exhaustive-when-last-branch', exhaustiveWhenLastBranch],
  ['suspend-lambda-result', suspendLambdaResult],
  ['suspend-unit-result', suspendUnitResult],
  ['jvm-static-bridge', jvmStaticBridge],
  ['generated-accessor', generatedAccessor],
  ['generated-member', generatedMember],
  ['value-class-member', valueClassMember],
  ['inline-function-body', inlineBody],
  ['inlined-beyond-file', inlinedBeyondFile],
  ['default-argument-stub', defaultStub],
];
