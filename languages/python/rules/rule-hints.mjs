import { exceptionRoute } from '../../../shared/exceptions/rule-names.mjs';
import { COMMON_EXCEPTION_RULES } from '../../../shared/policy.mjs';
import { ASYNC_HINTS } from './hints/ast-async.mjs';
import { STRUCTURE_HINTS } from './hints/ast-structure.mjs';
import { SMELL_HINTS } from './hints/ast-smells.mjs';
import { PYTEST_HINTS } from './hints/ruff-pytest.mjs';
import { SIGNATURE_HINTS } from './hints/signatures/ast-signatures.mjs';
import { SECURITY_HINTS } from './hints/security/ruff-security.mjs';
import { RULES_SECURITY_HINTS } from './hints/security/rules-security.mjs';
import { STYLE_HINTS } from './hints/ruff-style.mjs';
import { RULES_TOOL } from './hints/tool.mjs';
import { DEFAULT_LIBRARIES } from './libraries/project-libraries.mjs';

export { RULES_TOOL };
const TYPE_CHECK_TOOLS = ['mypy', 'pyright', 'basedpyright'];
const HINTED_TOOLS = [
  'ruff',
  ...TYPE_CHECK_TOOLS,
  RULES_TOOL,
  'coverage-py',
  'duplicates',
  'coupling',
  'import-linter',
  'dependencies',
  'test-runtime',
  'mutmut',
];

const RULES_ROUTED_BY_A_SETTING = new Set(['no-import-outside-roots']);

const FIX_TYPE = 'Fix the type; inline ignores are banned.';
const INSTALL_PACKAGE = 'Install the package, or its `types-` stubs, in the project environment.';
const USE_REPLACEMENT =
  'Call the replacement the deprecation notice names; the deprecated API is going away.';

export const RULE_HINTS = [
  ...STYLE_HINTS,
  ...PYTEST_HINTS,
  ...SECURITY_HINTS,
  ...RULES_SECURITY_HINTS,
  ...STRUCTURE_HINTS,
  ...ASYNC_HINTS,
  ...SMELL_HINTS,
  ...SIGNATURE_HINTS,
  { tool: 'mypy', rules: ['import-not-found', 'import-untyped'], allowed: INSTALL_PACKAGE },
  ...['pyright', 'basedpyright'].map((tool) => ({
    tool,
    rules: ['reportMissingImports', 'reportMissingModuleSource'],
    allowed: INSTALL_PACKAGE,
  })),
  { tool: 'mypy', rules: ['unused-ignore'], allowed: 'Delete the comment.', exception: false },
  { tool: 'mypy', rules: ['deprecated'], allowed: USE_REPLACEMENT },
  ...['pyright', 'basedpyright'].map((tool) => ({
    tool,
    rules: ['reportDeprecated'],
    allowed: USE_REPLACEMENT,
  })),
  ...TYPE_CHECK_TOOLS.map((tool) => ({ tool, rules: undefined, allowed: FIX_TYPE })),
];

function matches(hint, finding) {
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

export function hintFor(finding) {
  return RULE_HINTS.find((hint) => matches(hint, finding));
}

const PYTHON_EXCEPTIONS_KEY = 'python.exceptions';

export function describeRuleFinding(rule, subject, libraries = DEFAULT_LIBRARIES) {
  return RULE_HINTS.find((hint) => hint.tool === RULES_TOOL && hint.rules.includes(rule)).describe(
    subject,
    libraries,
  );
}

function allowedText(hint, finding, libraries) {
  return typeof hint.allowed === 'function'
    ? hint.allowed(finding.subject, libraries, finding.path)
    : hint.allowed;
}

export const PYTHON_RULES_IDS = RULE_HINTS.filter(({ tool }) => tool === RULES_TOOL).flatMap(
  ({ rules }) => rules,
);

function canBeLifted(finding) {
  return (
    HINTED_TOOLS.includes(finding.tool) &&
    finding.classification === 'enforceable' &&
    typeof finding.rule === 'string' &&
    finding.rule !== '' &&
    !COMMON_EXCEPTION_RULES.includes(finding.rule) &&
    finding.path !== '.'
  );
}

export function withHint(finding, libraries = DEFAULT_LIBRARIES) {
  const { subject, ...rest } = finding;
  const hint = hintFor(rest);
  if (hint === undefined && !canBeLifted(rest)) {
    return rest;
  }
  const routed = hint?.exception === false || RULES_ROUTED_BY_A_SETTING.has(rest.rule);
  const sentences = [
    `${rest.message.replace(/\.$/, '')}.`,
    ...(hint === undefined ? [] : [allowedText(hint, { subject, path: rest.path }, libraries)]),
    ...(routed
      ? []
      : [exceptionRoute({ rule: rest.rule, path: rest.path, key: PYTHON_EXCEPTIONS_KEY })]),
  ];
  return { ...rest, message: sentences.join(' ') };
}

export function applyRuleHints(findings, libraries = DEFAULT_LIBRARIES) {
  return findings.map((finding) => withHint(finding, libraries));
}
