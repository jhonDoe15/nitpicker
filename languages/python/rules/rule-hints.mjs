export const RULES_TOOL = 'python-rules';
const TYPE_CHECK_TOOLS = ['mypy', 'pyright'];
const HINTED_TOOLS = ['ruff', ...TYPE_CHECK_TOOLS, RULES_TOOL];

const LOGGING = 'Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`.';
const HANDLE_EXCEPTION =
  'Catch the specific exception and handle it, log it with `logger.exception(...)` or re-raise it; `contextlib.suppress(SpecificError)` ignores one expected error.';
const FIX_TYPE = 'Fix the type; inline ignores are banned.';
const INSTALL_PACKAGE = 'Install the package, or its `types-` stubs, in the project environment.';

export const RULE_HINTS = [
  {
    tool: 'ruff',
    rules: ['PTH'],
    prefix: true,
    allowed: 'Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.',
  },
  {
    tool: 'ruff',
    rules: ['UP031', 'UP032', 'FLY002'],
    allowed: 'Use an f-string: `f"Hello, {name}"`.',
  },
  {
    tool: 'ruff',
    rules: ['B006'],
    allowed:
      'Default to `None` and create the value inside the function, or use an immutable default such as a tuple.',
  },
  { tool: 'ruff', rules: ['E722', 'BLE001', 'S110', 'S112'], allowed: HANDLE_EXCEPTION },
  {
    tool: 'ruff',
    rules: ['F403'],
    allowed: 'Import the names you use: `from module import name`.',
  },
  { tool: 'ruff', rules: ['T201', 'T203'], allowed: LOGGING },
  {
    tool: 'ruff',
    rules: ['PERF203'],
    allowed: 'Move the `try` out of the loop, or handle each item in a helper function.',
  },
  {
    tool: RULES_TOOL,
    rules: ['frozen-dataclass'],
    describe: (subject) => `Dataclass ${subject} is not frozen`,
    allowed:
      'Declare records as `@dataclass(frozen=True)` and build a changed copy with `dataclasses.replace`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['pydantic-boundary'],
    describe: (subject) => `${subject} is imported outside an adapters/ package`,
    allowed:
      'Use pydantic only in an `adapters/` package to parse untrusted input, and pass frozen dataclasses on from there.',
  },
  {
    tool: RULES_TOOL,
    rules: ['enum-string-constants'],
    describe: (subject) => `${subject} are string constants that belong in one enum`,
    allowed:
      'Declare an enum: `class Status(enum.StrEnum): ACTIVE = "active"` on Python 3.11+, otherwise `class Status(str, enum.Enum)`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['no-type-check'],
    describe: (subject) => `\`${subject}\` is excluded from type checking by \`@no_type_check\``,
    allowed: 'Remove the decorator and annotate the code so the checker can verify it.',
  },
  {
    tool: RULES_TOOL,
    rules: ['not-type-checking'],
    describe: (subject) => `\`${subject}\` hides code from the type checkers`,
    allowed:
      'Put the code in the normal flow; `if TYPE_CHECKING:` is only for imports that annotations need.',
  },
  {
    tool: RULES_TOOL,
    rules: ['stub-beside-source'],
    describe: (subject) => `\`${subject}\` sits beside its source and replaces it for the checkers`,
    allowed: 'Delete the `.pyi` file and annotate the `.py` file itself.',
  },
  {
    tool: RULES_TOOL,
    rules: ['no-inline-suppression'],
    describe: (subject) => `Inline suppression \`# ${subject}\``,
    allowed:
      'Remove the comment and fix the code. If it must stay, add a "python.exceptions" entry for no-inline-suppression for this path.',
    exception: false,
  },
  { tool: 'mypy', rules: ['import-not-found', 'import-untyped'], allowed: INSTALL_PACKAGE },
  {
    tool: 'pyright',
    rules: ['reportMissingImports', 'reportMissingModuleSource'],
    allowed: INSTALL_PACKAGE,
  },
  { tool: 'mypy', rules: ['unused-ignore'], allowed: 'Delete the comment.', exception: false },
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

export function exceptionSentence(rule) {
  return `To allow it for some paths, add a "python.exceptions" entry for ${rule} in nitpicker.config.json.`;
}

export function describeRuleFinding(rule, subject) {
  return RULE_HINTS.find((hint) => hint.tool === RULES_TOOL && hint.rules.includes(rule)).describe(
    subject,
  );
}

export const PYTHON_RULES_IDS = RULE_HINTS.filter(({ tool }) => tool === RULES_TOOL).flatMap(
  ({ rules }) => rules,
);

function canBeLifted(finding) {
  return (
    HINTED_TOOLS.includes(finding.tool) &&
    finding.classification === 'enforceable' &&
    typeof finding.rule === 'string' &&
    finding.rule !== ''
  );
}

export function withHint(finding) {
  const hint = hintFor(finding);
  if (hint === undefined && !canBeLifted(finding)) {
    return finding;
  }
  const sentences = [
    `${finding.message.replace(/\.$/, '')}.`,
    ...(hint === undefined ? [] : [hint.allowed]),
    ...(hint?.exception === false ? [] : [exceptionSentence(finding.rule)]),
  ];
  return { ...finding, message: sentences.join(' ') };
}

export function applyRuleHints(findings) {
  return findings.map(withHint);
}
