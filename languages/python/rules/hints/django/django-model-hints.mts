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
    rules: ['nullable-dereference'],
    describe: nullableDescribe,
    allowed:
      'Check first: `if value is None: return ...`, `if value is not None:`, `value or default`, `getattr(value, "attr", None)`, or a queryset narrowed with `filter(field__isnull=False)`. For `request.user`, require a signed-in user with `@login_required` or test `request.user.is_authenticated`. Add `django-stubs` (mypy plugin) or `django-types` (pyright) so the type checker sees `null=True` fields and `.first()` as Optional.',
  },
];
