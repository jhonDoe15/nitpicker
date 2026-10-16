const CONDITIONALS = new Set(['NegateConditionalsMutator', 'ConditionalsBoundaryMutator']);
const SUSPEND_METHOD_END = 'Lkotlin/coroutines/Continuation;)Ljava/lang/Object;';
const INTRINSICS_CALL = /^removed call to kotlin\/jvm\/internal\/Intrinsics::(\w+)$/;
const INLINE_MARKER_CALL = /^removed call to kotlin\/jvm\/internal\/InlineMarker::/;
const COMPOSE_CALL =
  /^removed call to androidx\/compose\/runtime\/(?:Composer|ComposerKt|ScopeUpdateScope|RecomposeScope)::/;
const VALUE_CLASS_GENERATED = new Set([
  'box-impl',
  'unbox-impl',
  'equals-impl',
  'equals-impl0',
  'hashCode-impl',
  'toString-impl',
  'constructor-impl',
]);
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

function sourceKey({ className, sourceFile }) {
  return [...className.split('.').slice(0, -1), sourceFile].join('/');
}

function isConditional({ mutatorName }) {
  return CONDITIONALS.has(mutatorName);
}

function isReturn({ mutatorName }) {
  return mutatorName.includes('Return');
}

function isSuspendContext({ method, methodDescription }) {
  return method === 'invokeSuspend' || methodDescription.endsWith(SUSPEND_METHOD_END);
}

function unmangled(method) {
  return method.replace(/-[\w]{7}$/, '');
}

function accessorName(prefix, name) {
  return `${prefix}${name[0].toUpperCase()}${name.slice(1)}`;
}

function accessorsOf(property) {
  const getters = property.name.startsWith('is')
    ? [property.name, accessorName('get', property.name)]
    : [accessorName('get', property.name)];
  const setterName = property.name.startsWith('is')
    ? accessorName('set', property.name.slice(2))
    : accessorName('set', property.name);
  return {
    getters,
    setters: [setterName],
  };
}

function writtenNames(entry) {
  const names = new Set(entry.functions);
  for (const property of entry.properties) {
    const { getters, setters } = accessorsOf(property);
    for (const name of property.getter ? getters : []) {
      names.add(name);
    }
    for (const name of property.setter ? setters : []) {
      names.add(name);
    }
  }
  return names;
}

function generatedAccessor({ mutant, cls }) {
  return (
    cls !== undefined &&
    cls.properties.some((property) => {
      const { getters, setters } = accessorsOf(property);
      const written =
        (property.getter && getters.includes(mutant.method)) ||
        (property.setter && setters.includes(mutant.method));
      const named = getters.includes(mutant.method) || setters.includes(mutant.method);
      return named && !written && mutant.line >= property.start && mutant.line <= property.end;
    })
  );
}

function generatedMember({ mutant, cls }) {
  return (
    cls !== undefined &&
    cls.kind !== 'facade' &&
    mutant.method !== '<init>' &&
    mutant.method !== '<clinit>' &&
    mutant.line >= cls.start &&
    mutant.line <= cls.headerEnd &&
    !writtenNames(cls).has(unmangled(mutant.method))
  );
}

function valueClassMember({ mutant, cls }) {
  return (
    cls?.kind === 'value' &&
    VALUE_CLASS_GENERATED.has(mutant.method) &&
    !(mutant.method === 'constructor-impl' && cls.init) &&
    !cls.functions.includes(mutant.method.replace(/-impl0?$/, ''))
  );
}

function inlineBody({ mutant, file }) {
  const base = unmangled(mutant.method.replace(/(?:\$default|\$\$forInline)$/, ''));
  return (
    file !== undefined &&
    file.functions.some(
      (entry) =>
        entry.inline &&
        entry.class === mutant.className &&
        entry.name === base &&
        mutant.line >= entry.start &&
        mutant.line <= entry.end,
    )
  );
}

function inlinedBeyondFile({ mutant, file }) {
  return file !== undefined && mutant.line > file.lines;
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
  return (
    lambda === undefined ||
    !lambda.valueLines.includes(mutant.line) ||
    UNIT_BUILDERS.has(lambda.callee)
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
  ['generated-source', ({ mutant, generatedSources }) => generatedSources.has(sourceKey(mutant))],
  [
    'coroutine-throw-on-failure',
    ({ mutant }) => mutant.description === 'removed call to kotlin/ResultKt::throwOnFailure',
  ],
  ['null-check-intrinsic', nullCheckIntrinsic],
  ['inline-marker', ({ mutant }) => INLINE_MARKER_CALL.test(mutant.description)],
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
  ['generated-accessor', generatedAccessor],
  ['generated-member', generatedMember],
  ['value-class-member', valueClassMember],
  ['inline-function-body', inlineBody],
  ['inlined-beyond-file', inlinedBeyondFile],
  ['default-argument-stub', defaultStub],
];
