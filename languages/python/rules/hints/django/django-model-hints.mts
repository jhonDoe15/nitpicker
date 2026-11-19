import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const NULL_SOURCES: Readonly<Record<string, string>> = {
  'null=True field': 'is declared `null=True`, so it is `None` for some rows',
  '.first()': 'comes from `.first()`, which returns `None` when the queryset is empty',
  '.last()': 'comes from `.last()`, which returns `None` when the queryset is empty',
  '.get() without a default':
    'comes from `.get(...)` without a default, so it is `None` when the key is missing',
  'request.user':
    'is an `AnonymousUser` for visitors who are not signed in, and it has no such attribute',
};

function nullableDescribe(subject: string): string {
  const [value = '', source = ''] = subject.split('|');
  const reason = NULL_SOURCES[source] ?? 'can be `None`';
  return `\`${value}\` ${reason}, and no check before this line rules that out, so the use raises \`AttributeError\` or \`TypeError\` on that path`;
}

const LOOKUP_PROBLEMS: Readonly<Record<string, (keys: string) => string>> = {
  'not-unique': (keys) =>
    `looks the row up by \`${keys}\`, which no primary key, unique field or unique constraint of the model covers, so it raises \`MultipleObjectsReturned\` once two rows match (\`get_or_create\` creates a second row and can then fail on another constraint)`,
  'q-or': (keys) =>
    `matches an \`|\` of \`Q\` objects (\`${keys}\`), which can match several rows, so it raises \`MultipleObjectsReturned\``,
  mutable: (keys) =>
    `puts \`${keys}\` (a JSON, array or text field) in the lookup, so a value that was changed or is formatted differently never matches the stored row and every call creates a duplicate`,
};

function lookupDescribe(subject: string): string {
  const [call = '', kind = '', keys = ''] = subject.split('|');
  const problem = LOOKUP_PROBLEMS[kind]?.(keys) ?? 'looks the row up by fields that are not unique';
  return `\`${call}()\` ${problem}`;
}

export const DJANGO_MODEL_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['django-types-missing'],
    describe: () =>
      'Django is a dependency but no Django type plugin is configured, so mypy and pyright see `null=True` fields, `.first()` and `dict.get` as non-optional and the strict checks miss the `None` uses',
    allowed:
      'Add `django-stubs` with its mypy plugin (`plugins = ["mypy_django_plugin.main"]` and a `[tool.django-stubs]` settings module), or `django-types` for pyright; nitpicker does not change the type checker configuration itself.',
  },
  {
    tool: RULES_TOOL,
    rules: ['non-unique-lookup'],
    describe: lookupDescribe,
    allowed:
      'Look up by the primary key, a `unique=True` field, a `OneToOneField` or every field of a `UniqueConstraint` or `unique_together`; when several rows are possible use `filter(...).first()` (and `.filter(a).first() or .filter(b).first()` instead of an `|` of `Q` objects); keep changing JSON, array and text fields in `defaults={...}` instead of the lookup.',
  },
  {
    tool: RULES_TOOL,
    rules: ['nullable-dereference'],
    describe: nullableDescribe,
    allowed:
      'Check first: `if value is None: return ...`, `if value is not None:`, `value or default`, `getattr(value, "attr", None)`, or a queryset narrowed with `filter(field__isnull=False)`. For `request.user`, require a signed-in user with `@login_required` or test `request.user.is_authenticated`. Add `django-stubs` (mypy plugin) or `django-types` (pyright) so the type checker sees `null=True` fields and `.first()` as Optional.',
  },
];
