import { describe } from 'vitest';
import { code, declaredClass, useDeclarationScripts } from './declaration-support.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useDeclarationScripts(enabled);

const MODELS = [
  `import django_tables2 as tables
from django.contrib.contenttypes.fields import GenericForeignKey
from django.db import models


class Site(models.Model):
    name = models.CharField(max_length=20)


class Interface(models.Model):
    name = models.CharField(max_length=20)


class Address(models.Model):
    site = models.ForeignKey(Site, on_delete=models.CASCADE)
    label = models.CharField(max_length=20)
    interface = models.ForeignKey(Interface, related_name="addresses", on_delete=models.CASCADE)
    tags = models.ManyToManyField(Site, related_name="tagged")
    owner_type = models.ForeignKey("auth.Group", null=True, on_delete=models.CASCADE)
    owner_id = models.PositiveIntegerField(null=True)
    owner = GenericForeignKey("owner_type", "owner_id")

    @property
    def is_primary(self):
        return True

`,
];

function table(...lines: string[]): string {
  return declaredClass({
    models: MODELS,
    header: 'class AddressTable(tables.Table):',
    body: lines,
    meta: ['        model = Address', '        fields = ("label",)'],
  });
}

describe.skipIf(!enabled)('unsortable-table-column', () => {
  itOutcomes('flags sortable columns over values that are not database fields', [
    [
      'a column over a model property',
      table('    is_primary = tables.BooleanColumn(verbose_name="Primary")'),
      ['unsortable-table-column:29 is_primary|Address|not a field'],
    ],
    [
      'a column over a generic foreign key',
      table('    owner = tables.Column()'),
      ['unsortable-table-column:29 owner|Address|not a field'],
    ],
    [
      'a column over a reverse accessor with an explicit accessor',
      table('    ips = tables.Column(accessor="interface__addresses")'),
      ['unsortable-table-column:29 ips|Address|related manager'],
    ],
    [
      'a column over a many-to-many field',
      table('    tags = tables.TemplateColumn(template_code="x")'),
      ['unsortable-table-column:29 tags|Address|related manager'],
    ],
    [
      'a dotted accessor that ends at a property of the related model',
      table('    site_flag = tables.Column(accessor="site.is_main")'),
      ['unsortable-table-column:29 site_flag|Address|not a field'],
    ],
    [
      'a column that is not an attribute of the model at all',
      table('    actions = tables.TemplateColumn(template_code="x")'),
      ['unsortable-table-column:29 actions|Address|not a field'],
    ],
    [
      'a property column on a table that inherits the model from its parent',
      code(
        ...MODELS,
        'class BaseTable(tables.Table):',
        '    class Meta:',
        '        model = Address',
        '',
        '',
        'class ChildTable(BaseTable):',
        '    is_primary = tables.BooleanColumn()',
      ),
      ['unsortable-table-column:34 is_primary|Address|not a field'],
    ],
  ]);

  itOutcomes('stays quiet for fields and for columns that say how to sort', [
    [
      'a column over a field and over a related field path',
      table(
        '    label = tables.Column()',
        '    site = tables.Column()',
        '    site_name = tables.Column(accessor="site.name")',
        '    iface = tables.Column(accessor=tables.A("interface__name"))',
      ),
      [],
    ],
    ['orderable False', table('    is_primary = tables.BooleanColumn(orderable=False)'), []],
    [
      'an order_by naming real fields',
      table('    is_primary = tables.BooleanColumn(order_by=("label",))'),
      [],
    ],
    [
      'an order method on the table',
      table(
        '    is_primary = tables.BooleanColumn()',
        '',
        '    def order_is_primary(self, queryset, is_descending):',
        '        return queryset, True',
      ),
      [],
    ],
    [
      'a table that is not orderable',
      code(
        ...MODELS,
        'class AddressTable(tables.Table):',
        '    is_primary = tables.BooleanColumn()',
        '',
        '    class Meta:',
        '        model = Address',
        '        orderable = False',
      ),
      [],
    ],
    [
      'a name annotated onto the queryset elsewhere in the project',
      code(
        ...MODELS,
        'from django.db.models import Count',
        '',
        '',
        'def addresses():',
        '    return Address.objects.annotate(total=Count("tags"))',
        '',
        '',
        'class AddressTable(tables.Table):',
        '    total = tables.Column()',
        '',
        '    class Meta:',
        '        model = Address',
      ),
      [],
    ],
    [
      'columns that are never sortable by default',
      table(
        '    pk = tables.CheckBoxColumn(accessor="pk")',
        '    selection = tables.CheckBoxColumn()',
        '    labels = tables.ManyToManyColumn()',
        '    actions = tables.ActionsColumn(actions=())',
      ),
      [],
    ],
    [
      'a table without a model',
      code(
        'import django_tables2 as tables',
        '',
        '',
        'class PlainTable(tables.Table):',
        '    is_primary = tables.BooleanColumn()',
      ),
      [],
    ],
    [
      'a model with a base class outside the project',
      code(
        'import django_tables2 as tables',
        'from django.db import models',
        'from vendor.models import Timestamped',
        '',
        '',
        'class Note(Timestamped):',
        '    body = models.TextField()',
        '',
        '',
        'class NoteTable(tables.Table):',
        '    created_at = tables.DateTimeColumn()',
        '',
        '    class Meta:',
        '        model = Note',
      ),
      [],
    ],
    [
      'a foreign key attname, also inside a path',
      code(
        'import django_tables2 as tables',
        'from django.db import models',
        '',
        '',
        'class Owner(models.Model):',
        '    name = models.CharField(max_length=20)',
        '',
        '',
        'class Item(models.Model):',
        '    owner = models.ForeignKey(Owner, on_delete=models.CASCADE)',
        '',
        '',
        'class Entry(models.Model):',
        '    item = models.ForeignKey(Item, on_delete=models.CASCADE)',
        '',
        '',
        'class EntryTable(tables.Table):',
        '    item_id = tables.Column()',
        '    owner_id = tables.Column(accessor="item__owner_id")',
        '',
        '    class Meta:',
        '        model = Entry',
      ),
      [],
    ],
    [
      'an order method and orderable setting inherited from the parent table',
      code(
        ...MODELS,
        'class BaseTable(tables.Table):',
        '    def order_is_primary(self, queryset, is_descending):',
        '        return queryset, True',
        '',
        '    class Meta:',
        '        model = Address',
        '',
        '',
        'class ChildTable(BaseTable):',
        '    is_primary = tables.BooleanColumn()',
      ),
      [],
    ],
  ]);
});
