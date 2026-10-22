import { validatorNamed } from '../libraries/library-tables.mjs';
import { validatorsOf } from '../libraries/project-libraries.mjs';
import { RULES_TOOL } from './tool.mjs';

const IN_TEST = 'In a test, use `pytest.raises(SpecificError)` (`self.assertRaises` in unittest).';

const HANDLE_EXCEPTION = `Catch the specific exception and handle it, or re-raise it with its cause (\`raise DomainError(...) from error\`); \`contextlib.suppress(SpecificError)\` ignores one expected error. ${IN_TEST}`;

const CAUGHT_LOG_ADVICE = {
  logging:
    'Keep the traceback: `logger.exception("message")` or `logger.error("message", exc_info=True)`; the exception as an argument drops it. Re-raising after the log also passes.',
  structlog:
    'Keep the traceback: `logger.exception("event")` or `logger.error("event", exc_info=True)`; the exception as a field drops it. Re-raising after the log also passes.',
  loguru:
    'Keep the traceback: `logger.exception("message")` or `logger.opt(exception=True).error("message")`; the exception as an argument drops it. Re-raising after the log also passes.',
};

function validatorForm(name) {
  return `${name} (\`${validatorNamed(name).call}\`)`;
}

function boundaryAdvice(libraries) {
  const [validator] = validatorsOf(libraries);
  return `Parse untrusted input once at the boundary with ${validatorForm(validator)} in an \`adapters/\` package, not with \`isinstance\` checks or a \`TypeGuard\`.`;
}

function importBoundaryAdvice(libraries) {
  const validators = validatorsOf(libraries);
  return `Use ${validators.join(' or ')} only in an \`adapters/\` package to parse untrusted input (\`${validatorNamed(validators[0]).call}\`), and pass frozen dataclasses on from there.`;
}

function ownerOf(subject) {
  return subject.slice(0, subject.lastIndexOf('.'));
}

const UNUSED_OPTION_SCOPES = {
  private: 'by a call outside the tests',
  published: "by any call, this package's own tests included",
};

export const STRUCTURE_HINTS = [
  { tool: 'ruff', rules: ['E722', 'BLE001'], allowed: HANDLE_EXCEPTION },
  {
    tool: RULES_TOOL,
    rules: ['swallowed-exception'],
    describe: (subject) =>
      `\`${subject}\` swallows the error: it only logs it or returns a default, and carries on`,
    allowed: `Re-raise it with its cause (\`raise DomainError(...) from error\`), return a failure result that carries the error (\`return Rejected(str(error))\`), or collect it for the caller (\`errors.append(error)\`); logging alone is not handling. \`contextlib.suppress(SpecificError)\` ignores one expected error. ${IN_TEST}`,
  },
  {
    tool: RULES_TOOL,
    rules: ['catch-log-without-exception'],
    describe: (subject) => `\`${subject}\` logs a caught error without its traceback`,
    allowed: (_subject, libraries) => CAUGHT_LOG_ADVICE[libraries?.logging ?? 'logging'],
  },
  {
    tool: RULES_TOOL,
    rules: ['blind-suppress'],
    describe: (subject) => `\`${subject}\` ignores every error`,
    allowed: `Name the expected exception: \`contextlib.suppress(KeyError)\`; or handle it or re-raise it with its cause. ${IN_TEST}`,
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
    allowed: (_subject, libraries) => importBoundaryAdvice(libraries),
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
    allowed: 'Remove the comment and fix the code.',
  },
  {
    tool: RULES_TOOL,
    rules: ['todo-without-issue'],
    describe: (subject) => `The task marker \`${subject}\` has no issue`,
    allowed:
      'Name the issue right after the marker (`# TODO(#123): ...`, `# TODO PROJ-123: ...` or a link), or delete the comment and track the work in the issue tracker.',
  },
  {
    tool: RULES_TOOL,
    rules: ['process-env-access'],
    describe: (subject) =>
      `\`${subject}\` reads the process environment outside the composition root`,
    allowed:
      'Read the environment once in the composition root (`main.py`, `settings.py`, a `composition_root/` package) and pass the values in as arguments or a frozen settings dataclass.',
  },
  {
    tool: RULES_TOOL,
    rules: ['clock-now'],
    describe: (subject) => `\`${subject}()\` reads the clock in domain code`,
    allowed:
      'Take the time as a parameter or a `Callable[[], datetime]` and call `datetime.now(tz=UTC)` in the composition root.',
  },
  {
    tool: RULES_TOOL,
    rules: ['random-in-domain'],
    describe: (subject) => `\`${subject}()\` draws randomness in domain code`,
    allowed:
      'Take the value, a `random.Random` or an id factory as a parameter and create it in the composition root.',
  },
  {
    tool: RULES_TOOL,
    rules: ['io-in-domain'],
    describe: (subject) => `\`${subject}\` does input or output in domain code`,
    allowed:
      'Keep `domain/` pure: define a `Protocol` in the domain and implement it in `adapters/`, then pass the adapter in.',
  },
  {
    tool: RULES_TOOL,
    rules: ['module-level-mutable-state'],
    describe: (subject) => `\`${subject}\` changes a module-level collection`,
    allowed:
      'Keep the state in an object that is created in the composition root and passed in, or build a new immutable value and return it. A registry filled once at import time (a decorator that adds the function to a table) is not run-time state; the exception route below covers its path.',
  },
  {
    tool: RULES_TOOL,
    rules: ['unsafe-path-join'],
    describe: (subject) =>
      `\`${subject}()\` builds a file path from its input without a containment check`,
    allowed:
      'Resolve the path and check it stays inside the base before using it: `target = (base / name).resolve()`, then `if not target.is_relative_to(base.resolve()): raise ValueError(...)`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['handwritten-boundary-guard'],
    describe: (subject) => `\`${subject}\` checks untrusted data by hand`,
    allowed: (_subject, libraries) => boundaryAdvice(libraries),
  },
  {
    tool: RULES_TOOL,
    rules: ['any-in-domain'],
    describe: (subject) => `\`${subject}\` uses \`Any\` in domain code`,
    allowed:
      'Use the real type, a `Protocol`, a `TypeVar` or a frozen dataclass; parse untrusted data at the boundary so the domain only sees typed values.',
  },
  {
    tool: RULES_TOOL,
    rules: ['pydantic-any-field'],
    describe: (subject) => `The pydantic field \`${subject}\` is typed \`Any\``,
    allowed:
      'Give the field its real type (`str`, `int`, a nested model, `Literal[...]`) or constrain it with `Field(min_length=1)` so the model validates it.',
  },
  {
    tool: RULES_TOOL,
    rules: ['pydantic-extra-allow'],
    describe: (subject) => `The pydantic model \`${subject}\` accepts unknown fields`,
    allowed:
      'Set `model_config = ConfigDict(extra="forbid")` (or leave the default `ignore`) and declare every field the model needs.',
  },
  {
    tool: RULES_TOOL,
    rules: ['restating-docstring'],
    describe: (subject) => `The docstring of \`${subject}\` only restates its name`,
    allowed: 'Delete it, or say what the name cannot: a unit, a limit, an edge case or why.',
  },
  {
    tool: RULES_TOOL,
    rules: ['long-docstring'],
    describe: (subject, _libraries, { lines, limit }) =>
      `The docstring of \`${subject}\` has ${String(lines)} description lines (limit ${String(limit)})`,
    allowed:
      'Keep the non-obvious point (a unit, a limit, an edge case) and put the rest in names and types; `Args:`, `Returns:` and `:param x:` sections and code examples do not count.',
  },
  {
    tool: RULES_TOOL,
    rules: ['singular-and-plural-field'],
    describe: (subject, _libraries, { singular, plural, kind }) =>
      `Optional ${kind} \`${singular}\` and \`${plural}\` of \`${ownerOf(subject)}\` are two ways to pass the same data`,
    allowed: 'Keep the plural one and pass a single item as a one-element list.',
  },
  {
    tool: RULES_TOOL,
    rules: ['exhaustive-enum-predicate'],
    describe: (_subject, _libraries, { union }) => {
      const name = union === 'the Literal' ? union : `\`${union}\``;
      return `These comparisons list only some members of ${name}, so a member added later is silently classified as the default`;
    },
    allowed:
      'Classify every member with a `match` that ends in `case _: assert_never(value)` (or an `if`/`elif` chain that ends in `else: assert_never(value)`), so the type checker fails when a member is added.',
  },
  {
    tool: RULES_TOOL,
    rules: ['forwarding-wrapper'],
    describe: (subject, _libraries, { target }) =>
      `\`${subject}\` only forwards its parameters to \`${target}\`, with the same parameter and return types`,
    allowed:
      'Call the target directly and delete the wrapper; to keep the name, import the target under it (`from module import target as name`) or bind it (`name = target`).',
  },
  {
    tool: RULES_TOOL,
    rules: ['unused-option'],
    describe: (subject, _libraries, { scope }) =>
      `Optional parameter \`${subject}\` is never passed ${UNUSED_OPTION_SCOPES[scope]}`,
    allowed:
      'Remove the parameter and use its default inside the function, or pass it from a real call.',
  },
];
