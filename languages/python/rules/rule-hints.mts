import { COMMON_EXCEPTION_RULES } from '../../../shared/policy.mjs';
import { definedField, exceptionRoute } from './typed/route-views.mts';
import type { HintData, RuleHint } from './hints/hint-types.mts';
import type { IngestedFinding } from '../ingest/typed/ingest-types.mts';
import type { Libraries } from './libraries/typed/library-types.mts';
import { LOCATOR_HINTS } from './hints/ast/locators.mts';
import { ASYNC_HINTS } from './hints/ast/ast-async.mts';
import { STRUCTURE_HINTS } from './hints/ast/ast-structure.mts';
import { ROUND_TRIP_HINTS } from './hints/tests/round-trip-hints.mts';
import { CONTAINER_HINTS } from './hints/containers/containers.mts';
import { TYPING_HINTS } from './hints/typing/ast-typing.mts';
import { SMELL_HINTS } from './hints/ast/ast-smells.mts';
import { EFFECT_HINTS } from './hints/effects/index.mts';
import { WRITE_HINTS } from './hints/writes/index.mts';
import { MOCK_HINTS } from './hints/tests/mock-hints.mts';
import { REGEX_DEFECT_HINTS } from './regexes/regex-defects.mts';
import { ORM_HINTS } from './hints/persistence/ast-orm.mts';
import { CONTRACT_HINTS } from './hints/contracts/ast-contracts.mts';
import { SIGNATURE_HINTS } from './hints/signatures/ast-signatures.mts';
import { TEST_SWITCH_HINTS } from './hints/tests/ast-test-switches.mts';
import { PYTEST_HINTS } from './hints/tests/ruff-pytest.mts';
import { SECURITY_HINTS } from './hints/security/ruff-security.mts';
import { RULES_SECURITY_HINTS } from './hints/security/rules-security.mts';
import { PITFALL_HINTS } from './hints/pitfalls/ruff-pitfalls.mts';
import { PERSISTENCE_HINTS } from './hints/persistence/orm-hints.mts';
import { QUERY_HINTS } from './hints/persistence/query-hints.mts';
import { STYLE_HINTS } from './hints/ruff-style.mts';
import { SIMPLER_LOGIC_HINTS } from './hints/logic/simpler-logic.mts';
import { STREAM_HINTS } from './hints/streams/streams.mts';
import { LIFECYCLE_HINTS } from './hints/lifecycles/lifecycles.mts';
import { TIME_UNIT_HINTS } from './hints/time/time-units.mts';
import { RULES_TOOL } from './hints/tool.mts';
import { DEFAULT_LIBRARIES } from './libraries/project-libraries.mts';

export { RULES_TOOL };
const PYRIGHT_TOOLS = ['pyright', 'basedpyright'];
const TYPE_CHECK_TOOLS = ['mypy', ...PYRIGHT_TOOLS];
const HINTED_TOOLS = [
  'ruff',
  ...TYPE_CHECK_TOOLS,
  RULES_TOOL,
  'coverage-py',
  'duplicates',
  'coupling',
  'import-linter',
  'dependencies',
  'mutmut',
];

const LIFTED_TEST_RUNTIME_RULES = new Set([
  'no-production-runtime',
  'type-only-production-dependency',
]);
const RULES_ROUTED_BY_A_SETTING = new Set(['no-import-outside-roots']);

const FIX_TYPE = 'Fix the type; inline ignores are banned.';
const INSTALL_PACKAGE = 'Install the package, or its `types-` stubs, in the project environment.';
const USE_REPLACEMENT =
  'Call the replacement the deprecation notice names; the deprecated API is going away.';

export const RULE_HINTS: readonly RuleHint[] = [
  ...STYLE_HINTS,
  ...SIMPLER_LOGIC_HINTS,
  ...PITFALL_HINTS,
  ...PYTEST_HINTS,
  ...SECURITY_HINTS,
  ...RULES_SECURITY_HINTS,
  ...STRUCTURE_HINTS,
  ...ROUND_TRIP_HINTS,
  ...TYPING_HINTS,
  ...LOCATOR_HINTS,
  ...CONTRACT_HINTS,
  ...ASYNC_HINTS,
  ...SMELL_HINTS,
  ...EFFECT_HINTS,
  ...WRITE_HINTS,
  ...MOCK_HINTS,
  ...REGEX_DEFECT_HINTS,
  ...SIGNATURE_HINTS,
  ...TEST_SWITCH_HINTS,
  ...ORM_HINTS,
  ...PERSISTENCE_HINTS,
  ...QUERY_HINTS,
  ...TIME_UNIT_HINTS,
  ...CONTAINER_HINTS,
  ...STREAM_HINTS,
  ...LIFECYCLE_HINTS,
  { tool: 'mypy', rules: ['import-not-found', 'import-untyped'], allowed: INSTALL_PACKAGE },
  ...PYRIGHT_TOOLS.map((tool) => ({
    tool,
    rules: ['reportMissingImports', 'reportMissingModuleSource'],
    allowed: INSTALL_PACKAGE,
  })),
  { tool: 'mypy', rules: ['unused-ignore'], allowed: 'Delete the comment.', exception: false },
  { tool: 'mypy', rules: ['deprecated'], allowed: USE_REPLACEMENT },
  ...PYRIGHT_TOOLS.map((tool) => ({
    tool,
    rules: ['reportDeprecated'],
    allowed: USE_REPLACEMENT,
  })),
  ...TYPE_CHECK_TOOLS.map((tool) => ({ tool, rules: undefined, allowed: FIX_TYPE })),
];

type HintTarget = { readonly tool: string; readonly rule: string };

function matches(hint: RuleHint, finding: HintTarget): boolean {
  if (hint.tool !== finding.tool) {
    return false;
  }
  if (hint.rules === undefined) {
    return true;
  }
  return hint.prefix === true
    ? hint.rules.some((prefix) => finding.rule.startsWith(prefix))
    : hint.rules.includes(finding.rule);
}

export function hintFor(finding: HintTarget): RuleHint | undefined {
  return RULE_HINTS.find((hint) => matches(hint, finding));
}

const PYTHON_EXCEPTIONS_KEY = 'python.exceptions';

type DescribeOptions = { readonly libraries?: Libraries; readonly data?: HintData };

export function describeRuleFinding(
  rule: string,
  subject: string,
  { libraries = DEFAULT_LIBRARIES, data = {} }: DescribeOptions = {},
): string {
  const hint = RULE_HINTS.find((entry) => entry.tool === RULES_TOOL && entry.rules?.includes(rule));
  if (hint?.describe === undefined) {
    throw new TypeError(`No description for rule ${rule}`);
  }
  return hint.describe(subject, libraries, data);
}

type AllowedInput = {
  readonly subject: string | undefined;
  readonly path: string;
  readonly data: HintData | undefined;
};

function hintDataOf(value: unknown): HintData | undefined {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string | number] =>
            typeof entry[1] === 'string' || typeof entry[1] === 'number',
        ),
      )
    : undefined;
}

function allowedText(
  hint: RuleHint,
  finding: AllowedInput,
  libraries: Libraries,
): string | undefined {
  if (hint.allowedFor !== undefined) {
    return hint.allowedFor(finding.data ?? hint.referenceData ?? {});
  }
  return typeof hint.allowed === 'function'
    ? hint.allowed(finding.subject ?? '', libraries, finding.path)
    : hint.allowed;
}

export const PYTHON_RULES_IDS = RULE_HINTS.filter(({ tool }) => tool === RULES_TOOL).flatMap(
  ({ rules }) => rules ?? [],
);

function canBeLifted(finding: IngestedFinding): boolean {
  return (
    (HINTED_TOOLS.includes(finding.tool) ||
      (finding.tool === 'test-runtime' && LIFTED_TEST_RUNTIME_RULES.has(finding.rule))) &&
    finding.classification === 'enforceable' &&
    typeof finding.rule === 'string' &&
    finding.rule !== '' &&
    !COMMON_EXCEPTION_RULES.includes(finding.rule) &&
    finding.path !== '.'
  );
}

export function withHint(
  finding: IngestedFinding,
  libraries: Libraries = DEFAULT_LIBRARIES,
): IngestedFinding {
  const { subject, hintData, ...rest } = finding;
  const hint = hintFor(rest);
  if (hint === undefined && !canBeLifted(rest)) {
    return rest;
  }
  const routed = hint?.exception === false || RULES_ROUTED_BY_A_SETTING.has(rest.rule);
  const allowed =
    hint?.allowed === undefined && hint?.allowedFor === undefined
      ? undefined
      : allowedText(hint, { subject, path: rest.path, data: hintDataOf(hintData) }, libraries);
  const lifted = exceptionRoute({
    rule: rest.rule,
    path: rest.path,
    function: undefined,
    name: undefined,
    key: hint?.exception === 'top-level' ? 'exceptions' : PYTHON_EXCEPTIONS_KEY,
  });
  const sentences = [
    `${rest.message.replace(/\.$/, '')}.`,
    ...(allowed === undefined || rest.message.includes(allowed) ? [] : [allowed]),
    ...(routed ? [] : [lifted]),
  ];
  return { ...rest, message: sentences.join(' '), ...definedField('allowedForm', allowed) };
}

export function applyRuleHints(
  findings: readonly IngestedFinding[],
  libraries: Libraries = DEFAULT_LIBRARIES,
): IngestedFinding[] {
  return findings.map((finding) => withHint(finding, libraries));
}
