import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

function queryFieldDescribe(subject: string): string {
  const [attribute = '', entry = '<entry>', model = '<model>', kind = ''] = subject.split('|');
  if (kind === 'relation') {
    return `\`${attribute}\` entry \`${entry}\` ends at a relation of \`${model}\`, not at a text column, so searching it fails with a \`FieldError\` on the first request`;
  }
  return `\`${attribute}\` entry \`${entry}\` is not a field, relation path or annotation of \`${model}\`, so the request that uses it fails with a \`FieldError\` or ignores the setting`;
}

function filterMismatchDescribe(subject: string): string {
  const [name = '', queryset = '<queryset>', third = '<model>', kind] = subject.split('|');
  if (kind === 'to_field_name') {
    return `\`${name}\` sets \`to_field_name="${third}"\`, but \`${queryset}\` has no such field, so choices are rejected or the lookup fails`;
  }
  return `\`${name}\` filters a relation to \`${third}\` but takes its choices from the \`${queryset}\` queryset, so it offers rows of the wrong model and the filter matches nothing or the wrong rows`;
}

export const DJANGO_DECLARATION_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['unresolved-query-field'],
    describe: queryFieldDescribe,
    allowed:
      'Name a field of the view or admin model, a `__` path through its relations that ends at a column (`search_fields = ["app__name", "app__slug"]`), or a name the queryset annotates with `.annotate(name=...)`. Search a relation through a text column of the related model, not through the relation itself.',
  },
  {
    tool: RULES_TOOL,
    rules: ['filter-model-mismatch'],
    describe: filterMismatchDescribe,
    allowed:
      'Give `ModelChoiceFilter` and `ModelMultipleChoiceFilter` the queryset of the model the relation points to (`queryset=ProviderAccount.objects.all()`), and set `to_field_name` to a field of that model such as `slug` or `pk`.',
  },
];
