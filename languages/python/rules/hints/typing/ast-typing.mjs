import { validatorNamed } from '../../libraries/library-tables.mjs';
import { validatorsOf } from '../../libraries/project-libraries.mjs';
import { RULES_TOOL } from '../tool.mjs';

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

const CAST_CONTAINER = /^cast\((?:list|dict|set|frozenset|tuple)\b|^cast\([^)]*\[/u;

function castBoundaryAdvice(subject, libraries) {
  if (!CAST_CONTAINER.test(subject)) {
    return '';
  }
  const [validator] = validatorsOf(libraries);
  return ` Parse untrusted input once in \`adapters/\` with ${validatorForm(validator)}.`;
}

export const TYPING_HINTS = [
  {
    tool: RULES_TOOL,
    rules: ['type-cast'],
    describe: (subject) =>
      `\`${subject.split(' in ')[0]}\` asserts a type without checking the value`,
    allowed: (subject, libraries) =>
      `Narrow the value with \`isinstance\` or \`match\`, or give it the correct type at its source.${castBoundaryAdvice(subject, libraries)}`,
  },
  {
    tool: RULES_TOOL,
    rules: ['explicit-any'],
    describe: (subject) => `\`${subject}\` is typed with an explicit \`Any\``,
    allowed:
      'Write the concrete type, a `Protocol`, a `TypeVar`, a `ParamSpec` or `object` (`dict[str, object]`, `Callable[..., object]`).',
  },
  {
    tool: RULES_TOOL,
    rules: ['pydantic-boundary'],
    describe: (subject) => `${subject} is imported outside an adapters/ package`,
    allowed: (_subject, libraries) => importBoundaryAdvice(libraries),
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
];
