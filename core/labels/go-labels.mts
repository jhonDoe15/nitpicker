type Labels = readonly string[];

const BUG: Labels = ['bug'];
const SIMPLIFICATION: Labels = ['simplification'];
const PERFORMANCE_LABEL = 'performance';
const RELIABILITY_LABEL = 'reliability';
const ASYNC = 'async';
const PERSISTENCE = 'persistence';
const PERFORMANCE: Labels = [PERFORMANCE_LABEL];
const RELIABILITY: Labels = [RELIABILITY_LABEL];
const SECURITY: Labels = ['security'];
const RELIABLE_ASYNC: Labels = [RELIABILITY_LABEL, ASYNC];
const RELIABLE_PERSISTENCE: Labels = [RELIABILITY_LABEL, PERSISTENCE];
const STYLE: Labels = ['style'];
const TESTS: Labels = ['tests'];
const MAINTAINABILITY: Labels = ['maintainability'];

const GO_LINTERS: ReadonlyMap<string, Labels> = new Map([
  ['vet', BUG],
  ['errcheck', RELIABILITY],
  ['modernize', SIMPLIFICATION],
  ['gosec', SECURITY],
  ['revive', STYLE],
  ['bodyclose', RELIABILITY],
  ['rowserrcheck', RELIABLE_PERSISTENCE],
  ['sqlclosecheck', RELIABLE_PERSISTENCE],
  ['noctx', RELIABILITY],
  ['errorlint', BUG],
  ['nilerr', BUG],
  ['nilnil', BUG],
  ['errname', STYLE],
  ['contextcheck', ['bug', ASYNC]],
  ['containedctx', MAINTAINABILITY],
  ['fatcontext', PERFORMANCE],
  ['exhaustive', BUG],
  ['recvcheck', STYLE],
  ['durationcheck', BUG],
  ['makezero', BUG],
  ['reassign', BUG],
  ['unconvert', SIMPLIFICATION],
  ['wastedassign', SIMPLIFICATION],
  ['thelper', TESTS],
  ['tparallel', TESTS],
  ['testifylint', TESTS],
  ['usetesting', TESTS],
  ['asciicheck', STYLE],
  ['bidichk', SECURITY],
  ['gocheckcompilerdirectives', BUG],
  ['canonicalheader', STYLE],
  ['musttag', BUG],
  ['perfsprint', PERFORMANCE],
  ['usestdlibvars', STYLE],
  ['sloglint', STYLE],
  ['spancheck', BUG],
  ['deadcode', SIMPLIFICATION],
]);

const STATICCHECK_PREFIXES: readonly (readonly [string, Labels])[] = [
  ['SA', BUG],
  ['ST', STYLE],
  ['QF', SIMPLIFICATION],
  ['S', SIMPLIFICATION],
];

const GOCRITIC_GROUPS: readonly (readonly [Labels, readonly string[]])[] = [
  [
    BUG,
    [
      'appendAssign',
      'argOrder',
      'badCall',
      'badCond',
      'badLock',
      'badRegexp',
      'badSyncOnceFunc',
      'dupArg',
      'dupCase',
      'dupOption',
      'evalOrder',
      'exitAfterDefer',
      'filepathJoin',
      'flagDeref',
      'flagName',
      'mapKey',
      'nilValReturn',
      'offBy1',
      'rangeAppendAll',
      'regexpPattern',
      'returnAfterHttpError',
      'sloppyReassign',
      'sortSlice',
      'syncMapLoadAndDelete',
      'truncateCmp',
      'uncheckedInlineErr',
      'weakCond',
    ],
  ],
  [['bug', PERSISTENCE], ['sqlQuery']],
  [
    PERFORMANCE,
    [
      'appendCombine',
      'equalFold',
      'indexAlloc',
      'preferDecodeRune',
      'preferFprint',
      'preferStringWriter',
      'preferWriteByte',
      'stringXbytes',
      'zeroByteRepeat',
    ],
  ],
  [
    STYLE,
    [
      'captLocal',
      'codegenComment',
      'deprecatedComment',
      'docStub',
      'hexLiteral',
      'octalLiteral',
      'regexpMust',
      'typeDefFirst',
    ],
  ],
  [MAINTAINABILITY, ['exposedSyncMutex', 'ptrToRefParam']],
];

const GOCRITIC: ReadonlyMap<string, Labels> = new Map(
  GOCRITIC_GROUPS.flatMap(([labels, checkers]) => checkers.map((checker) => [checker, labels])),
);

const GO_RULES: ReadonlyMap<string, Labels> = new Map([
  ['context_outside_entry', ['maintainability', ASYNC]],
  ['forwarding_method_alias', SIMPLIFICATION],
  ['lone_interface', MAINTAINABILITY],
  ['once_keeps_error', RELIABLE_ASYNC],
  ['test_without_assertion', TESTS],
  ['copy_pasted_tests', TESTS],
  ['ticker_not_stopped', RELIABLE_ASYNC],
  ['any_in_exported_signature', MAINTAINABILITY],
  ['cleanup_skipped', RELIABILITY],
  ['io_in_loop', PERFORMANCE],
  ['logged_and_returned', RELIABILITY],
  ['pending_not_closed', RELIABLE_ASYNC],
  ['sleep_to_wait', ['tests', ASYNC]],
  ['unowned_goroutine', RELIABLE_ASYNC],
  ['init_side_effect', MAINTAINABILITY],
  ['map_only_grows', [PERFORMANCE_LABEL, RELIABILITY_LABEL]],
  ['unused_option', SIMPLIFICATION],
  ['hardcoded_secret', SECURITY],
  ['http_without_timeout', RELIABILITY],
  ['mutable_package_state', MAINTAINABILITY],
  ['panic_for_failure', RELIABILITY],
  ['swallowed_error', RELIABILITY],
  ['generic_name', STYLE],
  ['generic_package_name', STYLE],
  ['secret_in_log', SECURITY],
  ['todo_without_issue', STYLE],
  ['unindexed_foreign_key', [PERFORMANCE_LABEL, PERSISTENCE]],
  ['repeated_string_literal', MAINTAINABILITY],
  ['credential_shape', SECURITY],
  ['get_prefixed_getter', STYLE],
  ['self_recursion', [RELIABILITY_LABEL, ...MAINTAINABILITY]],
]);

function staticcheckLabels(rule: string): Labels {
  return STATICCHECK_PREFIXES.find(([prefix]) => rule.startsWith(prefix))?.[1] ?? BUG;
}

export function goLabels(tool: string, rule: string): Labels | undefined {
  if (tool === 'staticcheck') {
    return staticcheckLabels(rule);
  }
  if (tool === 'gocritic') {
    return GOCRITIC.get(rule) ?? SIMPLIFICATION;
  }
  if (tool === 'go-rules') {
    return GO_RULES.get(rule) ?? MAINTAINABILITY;
  }
  return GO_LINTERS.get(tool);
}

const BROAD_LINTERS: ReadonlySet<string> = new Set(['exhaustive']);
const BROAD_GO_RULES: ReadonlySet<string> = new Set(['repeated_string_literal']);

export function isBroadGoRule(tool: string, rule: string): boolean {
  return BROAD_LINTERS.has(tool) || (tool === 'go-rules' && BROAD_GO_RULES.has(rule));
}

export const GO_RULE_NAMES: readonly string[] = [...GO_RULES.keys()];
export const GOCRITIC_CHECKERS: readonly string[] = [...GOCRITIC.keys()];
