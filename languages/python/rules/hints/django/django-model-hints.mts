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

function reasonedDescribe(
  reasons: Readonly<Record<string, (detail: string) => string>>,
  fallback: string,
  frame: (head: string, reason: string) => string,
): (subject: string) => string {
  return (subject) => {
    const [head = '', kind = '', detail = ''] = subject.split('|');
    return frame(head, reasons[kind]?.(detail) ?? fallback);
  };
}

const lookupDescribe = reasonedDescribe(
  LOOKUP_PROBLEMS,
  'looks the row up by fields that are not unique',
  (call, reason) => `\`${call}()\` ${reason}`,
);

const EMPTY_FILTERS: Readonly<Record<string, (value: string) => string>> = {
  branch: (value) =>
    `\`${value}\` can be an empty \`Q()\`, and a filter without conditions selects every row, so when that branch runs the query (and a delete, update or add on its result) acts on the whole table`,
  reduce: (value) =>
    `\`${value}\` starts from an empty \`Q()\`; with no items it stays empty and the filter selects every row`,
  loop: (value) =>
    `\`${value}\` starts as an empty \`Q()\` and is filled in a loop; when the loop has no items it stays empty and the filter selects every row`,
  'sql-empty': (value) =>
    `\`${value}\` has no arguments, so it adds no condition and the statement selects, updates or deletes every row`,
  'sql-spread': (value) =>
    `\`${value}\` is built from a list that can be empty, and \`or_()\` or \`and_()\` of nothing adds no condition, so the statement then covers every row`,
};

const emptyFilterDescribe = reasonedDescribe(
  EMPTY_FILTERS,
  'can be an empty `Q()`',
  (method, reason) => `The argument of \`${method}()\`: ${reason}`,
);

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
    rules: ['empty-filter-condition'],
    describe: emptyFilterDescribe,
    allowed:
      'Handle the empty case on its own: `queryset.none()`, `pk__in=ids` (an empty list matches nothing) instead of a `Q` built from the members, or an explicit `if not ids:` check before the query; in SQLAlchemy check the list before `or_(*items)` or `and_(*items)`.',
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
