import { generatedAccessor, generatedMember, valueClassMember } from './member-rules.mjs';
import {
  isConditional,
  isReturn,
  isSuspendContext,
  outerClass,
  unmangled,
} from './mutant-kinds.mjs';

const INTRINSICS_CALL = /^removed call to kotlin\/jvm\/internal\/Intrinsics::(\w+)$/;
const INLINE_MARKER_CALL = /^removed call to kotlin\/jvm\/internal\/InlineMarker::/;
const COMPOSE_CALL =
  /^removed call to androidx\/compose\/runtime\/(?:Composer|ComposerKt|ScopeUpdateScope|RecomposeScope)::/;
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

function inlineBody({ mutant, file }) {
  const base = unmangled(mutant.method.replace(/(?:\$default|\$\$forInline)$/, ''));
  return (
    file !== undefined &&
    file.functions.some(
      (entry) =>
        entry.inline &&
        entry.class === mutant.className &&
        entry.name === base &&
        (mutant.line > file.lines || (mutant.line >= entry.start && mutant.line <= entry.end)),
    )
  );
}

function inlinedBeyondFile({ mutant, file }) {
  const owner = outerClass(mutant.className);
  return (
    file !== undefined &&
    mutant.line > file.lines &&
    !file.functions.some(
      (entry) => entry.inlineCalls.length > 0 && outerClass(entry.class) === owner,
    )
  );
}

function defaultStub({ mutant, file }) {
  const stub =
    mutant.method.endsWith('$default') ||
    mutant.methodDescription.includes('DefaultConstructorMarker');
  return stub && isConditional(mutant) && file !== undefined && !file.branching.has(mutant.line);
}

function stateMachineBranch({ mutant, file }) {
  return (
    isConditional(mutant) &&
    isSuspendContext(mutant) &&
    file !== undefined &&
    !file.branching.has(mutant.line)
  );
}

function innermostLambda(file, line) {
  return file.lambdas
    .filter((lambda) => line >= lambda.start && line <= lambda.end)
    .reduce(
      (inner, lambda) =>
        inner === undefined ||
        lambda.start > inner.start ||
        (lambda.start === inner.start && lambda.end < inner.end)
          ? lambda
          : inner,
      undefined,
    );
}

function suspendLambdaResult({ mutant, file }) {
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
    UNIT_BUILDERS.has(lambda.callee)
  );
}

function suspendUnitResult({ mutant, file }) {
  return (
    isReturn(mutant) &&
    file !== undefined &&
    file.functions.some(
      (entry) =>
        entry.suspend &&
        entry.returnsUnit &&
        entry.class === mutant.className &&
        entry.name === unmangled(mutant.method),
    )
  );
}

function jvmStaticBridge({ mutant, file }) {
  return (
    file !== undefined &&
    file.functions.some(
      (entry) => entry.staticIn === mutant.className && entry.name === unmangled(mutant.method),
    )
  );
}

function defaultImplsTwin({ mutant, siblings }) {
  const suffix = '$DefaultImpls';
  return (
    mutant.className.endsWith(suffix) &&
    siblings.has(`${mutant.className.slice(0, -suffix.length)}|${mutant.method}`)
  );
}

function nullCheckIntrinsic({ mutant, file }) {
  const call = INTRINSICS_CALL.exec(mutant.description);
  if (call === null) {
    return false;
  }
  return !(call[1] === 'checkNotNull' && file?.bang.has(mutant.line));
}

export const SOURCE_FREE_RULES = [
  [
    'coroutine-throw-on-failure',
    ({ mutant }) => mutant.description === 'removed call to kotlin/ResultKt::throwOnFailure',
  ],
  ['null-check-intrinsic', nullCheckIntrinsic],
  ['inline-marker', ({ mutant }) => INLINE_MARKER_CALL.test(mutant.description)],
  [
    'unit-result',
    ({ mutant }) => isReturn(mutant) && mutant.methodDescription.endsWith(')Lkotlin/Unit;'),
  ],
  ['default-impls-twin', defaultImplsTwin],
  [
    'when-mappings',
    ({ mutant, declared }) =>
      mutant.className.endsWith('$WhenMappings') && !declared.has(mutant.className),
  ],
  ['synthetic-accessor', ({ mutant }) => mutant.method.startsWith('access$')],
  ['serializer-class', ({ mutant }) => mutant.className.endsWith('$$serializer')],
  [
    'compose-generated',
    ({ mutant }) =>
      mutant.className.includes('ComposableSingletons$') || COMPOSE_CALL.test(mutant.description),
  ],
];

export const SOURCE_RULES = [
  ['state-machine-branch', stateMachineBranch],
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
