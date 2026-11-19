import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const MODEL = '<model>';

function queryFieldDescribe(subject: string): string {
  const [attribute = '', entry = '<entry>', model = MODEL, kind = ''] = subject.split('|');
  if (kind === 'relation') {
    return `\`${attribute}\` entry \`${entry}\` ends at a relation of \`${model}\`, not at a text column, so searching it fails with a \`FieldError\` on the first request`;
  }
  return `\`${attribute}\` entry \`${entry}\` is not a field, relation path or annotation of \`${model}\`, so the request that uses it fails with a \`FieldError\` or ignores the setting`;
}

function filterMismatchDescribe(subject: string): string {
  const [name = '', queryset = '<queryset>', third = MODEL, kind] = subject.split('|');
  if (kind === 'to_field_name') {
    return `\`${name}\` sets \`to_field_name="${third}"\`, but \`${queryset}\` has no such field, so choices are rejected or the lookup fails`;
  }
  return `\`${name}\` filters a relation to \`${third}\` but takes its choices from the \`${queryset}\` queryset, so it offers rows of the wrong model and the filter matches nothing or the wrong rows`;
}

function serializerDescribe(subject: string): string {
  const [name = '', owner = MODEL, kind = ''] = subject.split('|');
  if (kind === 'method') {
    return `\`${name}\` is a method field of \`${owner}\` whose method can return \`None\`, but the declared schema says it never is null, so typed clients crash on the null`;
  }
  if (kind === 'required') {
    return `\`${name}\` is required by default, but the \`${owner}\` column it fills is blank or has a default, so a request that leaves it out is rejected with a 400`;
  }
  return `\`${name}\` reads a nullable value of \`${owner}\` without \`allow_null=True\`, so a row with no value fails serialization or is published as non-null and typed clients crash on the null`;
}

function omittedDescribe(subject: string): string {
  const [name = '', owner = '<serializer>', model = MODEL] = subject.split('|');
  return `\`${owner}\` leaves out \`${name}\`, which most other serializers of \`${model}\` expose, so clients that read this endpoint miss the value or a field was dropped by accident`;
}

function columnDescribe(subject: string): string {
  const [name = '', model = MODEL, kind = ''] = subject.split('|');
  const value =
    kind === 'related manager'
      ? `a many-valued relation of \`${model}\``
      : `a value that is not a database column of \`${model}\` (a property, a generic foreign key or a derived value)`;
  return `The table column \`${name}\` is sortable by default but shows ${value}, so clicking its header raises a \`FieldError\` or sorts by the wrong thing`;
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
  {
    tool: RULES_TOOL,
    rules: ['serializer-null-mismatch'],
    describe: serializerDescribe,
    allowed:
      'Declare what the model allows: `allow_null=True` on a field over a `null=True` column or a reverse one-to-one relation (`GroupSerializer(source="group", read_only=True, allow_null=True)`), `required=False` for a blank column or one with a default, and for a method field either an `Optional` return annotation or `@extend_schema_field(...)` with `allow_null=True`.',
  },
  {
    tool: RULES_TOOL,
    rules: ['serializer-fields-omitted'],
    describe: omittedDescribe,
    allowed:
      'Add the field to `Meta.fields`; when the omission is intended, name the serializer as a variant (`BriefDeviceSerializer`, `NestedDeviceSerializer`, `DeviceWriteSerializer`) or use `exclude` to show the intent.',
  },
  {
    tool: RULES_TOOL,
    rules: ['unsortable-table-column'],
    describe: columnDescribe,
    allowed:
      'Turn sorting off for a column that is not a database field: `tables.BooleanColumn(orderable=False)`; or name the real fields it sorts by with `order_by=("label",)`, add an `order_<name>` method to the table, or set `orderable = False` in the table `Meta`.',
  },
];
