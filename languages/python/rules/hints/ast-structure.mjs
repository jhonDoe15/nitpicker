import { RULES_TOOL } from './tool.mjs';

const HANDLE_EXCEPTION =
  'Catch the specific exception and handle it, or re-raise it with its cause (`raise DomainError(...) from error`); `contextlib.suppress(SpecificError)` ignores one expected error.';

export const STRUCTURE_HINTS = [
  { tool: 'ruff', rules: ['E722', 'BLE001'], allowed: HANDLE_EXCEPTION },
  {
    tool: RULES_TOOL,
    rules: ['swallowed-exception'],
    describe: (subject) => `\`${subject}\` swallows the error`,
    allowed:
      'Hand the error on: re-raise it (`raise DomainError(...) from error`), return a failure value built from it, or return a named default; logging alone is not handling. `contextlib.suppress(SpecificError)` ignores one expected error.',
  },
  {
    tool: RULES_TOOL,
    rules: ['blind-suppress'],
    describe: (subject) => `\`${subject}\` ignores every error`,
    allowed:
      'Name the expected exception: `contextlib.suppress(KeyError)`; or handle it or re-raise it with its cause.',
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
    describe: (subject) => `The module-level collection \`${subject}\` is changed by a function`,
    allowed:
      'Keep the state in an object that is created in the composition root and passed in, or build a new immutable value and return it.',
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
    allowed:
      'Parse untrusted input once at the boundary with pydantic (`Model.model_validate(data)`) in an `adapters/` package, not with `isinstance` checks or a `TypeGuard`.',
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
];
