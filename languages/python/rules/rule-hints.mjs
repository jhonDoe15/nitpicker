export const RULES_TOOL = 'python-rules';
export const TYPE_CHECK_TOOLS = ['mypy', 'pyright'];

const LOGGING = 'Use `logging`: `logger = logging.getLogger(__name__)`, then `logger.info(...)`.';
const HANDLE_EXCEPTION =
  'Catch the specific exception and handle it, log it with `logger.exception(...)` or re-raise it; `contextlib.suppress(SpecificError)` ignores one expected error.';
const FIX_TYPE =
  'Fix the type: correct the annotation or narrow the value with a check. Inline ignores are banned.';

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
    allowed: 'Declare an enum: `class Status(enum.StrEnum): ACTIVE = "active"`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['no-inline-suppression'],
    describe: (subject) => `Inline suppression \`# ${subject}\``,
    allowed:
      'Fix the cause instead: `# type: ignore`, `# noqa` and `# pyright: ignore` are banned. If the code is legitimate, add a "python.exceptions" entry for the rule it suppressed.',
    exception: false,
  },
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

export function withHint(finding) {
  const hint = hintFor(finding);
  if (hint === undefined) {
    return finding;
  }
  const sentences = [
    `${finding.message.replace(/\.$/, '')}.`,
    hint.allowed,
    ...(hint.exception === false ? [] : [exceptionSentence(finding.rule)]),
  ];
  return { ...finding, message: sentences.join(' ') };
}

export function applyRuleHints(findings) {
  return findings.map(withHint);
}
