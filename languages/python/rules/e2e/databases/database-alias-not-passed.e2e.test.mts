import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({
  enabled,
  hidden: [
    'test-without-assertion',
    'io-in-loop',
    'unordered-query',
    'related-writes-without-transaction',
    'client-without-timeout',
  ],
});

const RULE = 'database-alias-not-passed';
const MODELS = code(
  'from django.db import models',
  '',
  '',
  ...['Cable', 'CablePath', 'Item', 'Child', 'Parent'].flatMap((name) => [
    `class ${name}(models.Model):`,
    '    name = models.CharField()',
    '',
    '',
  ]),
);
const SEVERAL = code(
  'DATABASES = {',
  '    "default": {"ENGINE": "django.db.backends.postgresql"},',
  '    "replica": {"ENGINE": "django.db.backends.postgresql"},',
  '}',
);
const SINGLE = code('DATABASES = {"default": {"ENGINE": "django.db.backends.postgresql"}}');
const SETUP = { files: { 'models.py': MODELS, 'settings.py': SEVERAL } };
const RECEIVER = [
  'from django.db.models.signals import post_save',
  'from django.dispatch import receiver',
  '',
  '',
  '@receiver(post_save, sender=Cable)',
];
const TRANSACTION = ['from django.db import transaction', '', ''];

describe.skipIf(!enabled)('database-alias-not-passed', () => {
  itOutcomes('flags work that drops the alias it was given', [
    ['a project with two databases', SETUP, []],
    [
      'a signal receiver that queries the default database',
      code(
        ...RECEIVER,
        'def update_paths(instance, using, **kwargs):',
        '    CablePath.objects.filter(origin=instance).delete()',
      ),
      [`${RULE}:7 update_paths|CablePath.objects|using`],
    ],
    [
      'a receiver that reads the alias from the keyword arguments',
      code(
        ...RECEIVER,
        'def update_paths(instance, **kwargs):',
        '    db = kwargs["using"]',
        '    return list(Item.objects.filter(cable=instance))',
      ),
      [`${RULE}:8 update_paths|Item.objects|kwargs['using']`],
    ],
    [
      'a receiver that saves and deletes without the alias',
      code(
        ...RECEIVER,
        'def update_paths(instance, using, **kwargs):',
        '    instance.save()',
        '    instance.delete()',
      ),
      [
        `${RULE}:7 update_paths|instance.save()|using`,
        `${RULE}:8 update_paths|instance.delete()|using`,
      ],
    ],
    [
      'a receiver that bulk creates through the sender manager',
      code(
        ...RECEIVER,
        'def update_paths(sender, using, **kwargs):',
        '    sender._default_manager.bulk_create([])',
      ),
      [`${RULE}:7 update_paths|sender._default_manager|using`],
    ],
    [
      'transactions without the alias',
      code(
        ...TRANSACTION,
        'def move(rows, using):',
        '    with transaction.atomic():',
        '        Item.objects.using(using).bulk_create(rows)',
        '        transaction.on_commit(lambda: None)',
        '        transaction.set_rollback(True)',
      ),
      [
        `${RULE}:5 move|transaction.atomic()|using`,
        `${RULE}:7 move|transaction.on_commit()|using`,
        `${RULE}:8 move|transaction.set_rollback()|using`,
      ],
    ],
    [
      'a data migration function',
      code(
        'def forwards(apps, schema_editor):',
        '    Item = apps.get_model("shop", "Item")',
        '    Item.objects.filter(name="a").update(name="b")',
      ),
      [`${RULE}:3 forwards|Item.objects|schema_editor.connection.alias`],
    ],
    [
      'a delete override that queries children without the alias',
      code(
        'from django.db import models',
        '',
        '',
        'class Holder(models.Model):',
        '    def delete(self, using=None, keep_parents=False):',
        '        Child.objects.filter(name="a").delete()',
        '        super().delete(using=using)',
      ),
      [`${RULE}:6 Holder.delete|Child.objects|using`],
    ],
    [
      'work bound to another alias',
      code(
        ...TRANSACTION,
        'def move(instance: Item, using):',
        '    Item.objects.using("replica").filter(name="a").count()',
        '    instance.save(using="replica")',
        '    with transaction.atomic(using="other"):',
        '        pass',
      ),
      [
        `${RULE}:5 move|Item.objects.using('replica')|using|other`,
        `${RULE}:6 move|instance.save()|using|other`,
        `${RULE}:7 move|transaction.atomic()|using|other`,
      ],
    ],
    [
      'a second query after one bound to the alias',
      code(
        'def names(using):',
        '    bound = Item.objects.using(using)',
        '    other = Child.objects.filter(name="a").count()',
        '    return bound.count() + other',
      ),
      [`${RULE}:3 names|Child.objects|using`],
    ],
    [
      'writes on typed parameters, model methods and rows from the ORM',
      code(
        'from django.db import models',
        '',
        '',
        'def typed(item: Item, using):',
        '    item.save()',
        '',
        '',
        'def loaded(using):',
        '    row = Item.objects.using(using).first()',
        '    row.save()',
        '',
        '',
        'class Keeper(models.Model):',
        '    def archive(self, using):',
        '        self.save()',
        '',
        '    def save(self, *args, using=None, **kwargs):',
        '        super().save(*args, **kwargs)',
      ),
      [
        `${RULE}:5 typed|item.save()|using`,
        `${RULE}:10 loaded|row.save()|using`,
        `${RULE}:15 Keeper.archive|self.save()|using`,
        `${RULE}:18 Keeper.save|super().save()|using`,
      ],
    ],
    [
      'a replica parameter',
      code(
        'def names(database):',
        '    Child.objects.using(database).count()',
        '    return [row.name for row in Item.objects.all()]',
      ),
      [`${RULE}:3 names|Item.objects|database`],
    ],
  ]);

  itOutcomes('stays quiet where the alias is passed on or not needed', [
    ['a project with two databases', SETUP, []],
    [
      'queries bound by using, db_manager or the instance database',
      code(
        ...RECEIVER,
        'def update_paths(instance, using, **kwargs):',
        '    CablePath.objects.using(using).filter(origin=instance).delete()',
        '    Item.objects.db_manager(using).bulk_create([])',
        '    Item.objects.using(instance._state.db).filter(name="a").count()',
      ),
      [],
    ],
    [
      'writes and transactions that pass the alias',
      code(
        ...TRANSACTION,
        'def move(instance, using):',
        '    with transaction.atomic(using=using):',
        '        instance.save(using=using)',
        '        transaction.on_commit(lambda: None, using=using)',
        '        transaction.set_rollback(True, using=using)',
        '    with transaction.atomic(using):',
        '        instance.delete(using=using)',
      ),
      [],
    ],
    [
      'an alias copied to a variable or taken from the instance',
      code(
        'def names(instance, using):',
        '    db = using',
        '    Item.objects.using(db).count()',
        '    Child.objects.using(instance._state.db).count()',
      ),
      [],
    ],
    [
      'parameters that are not aliases',
      code(
        'def load(database):',
        '    return list(Item.objects.all())',
        '',
        '',
        'def other(connection_name, x):',
        '    return list(Item.objects.all())',
        '',
        '',
        'def run(x, database):',
        '    return database.execute("select 1")',
      ),
      [],
    ],
    [
      'an alias from the router or a connection, and explicit pins',
      code(
        'from django.db import DEFAULT_DB_ALIAS, connections, router',
        '',
        '',
        'def names(using):',
        '    db = router.db_for_read(Item)',
        '    Item.objects.using(db).count()',
        '    Child.objects.using(connections[using].alias).count()',
        '    Parent.objects.using("default").count()',
        '    Cable.objects.using(DEFAULT_DB_ALIAS).count()',
      ),
      [],
    ],
    [
      'a model instance that is not known to be a model',
      code(
        'from django.db.models.signals import post_save',
        'from django.dispatch import receiver',
        '',
        '',
        '@receiver(post_save, sender=Unknown)',
        'def on_change(instance, using, **kwargs):',
        '    instance.save()',
        '',
        '',
        'def other(obj, using):',
        '    obj.delete()',
      ),
      [],
    ],
    [
      'a queryset bound after it is assigned',
      code(
        'def names(using):',
        '    rows = Item.objects.filter(name="a")',
        '    return list(rows.using(using))',
      ),
      [],
    ],
    [
      'a query that is returned and not run',
      code('def rows(using):', '    return Item.objects.filter(name="a")'),
      [],
    ],
    [
      'a function without an alias in scope',
      code(
        ...TRANSACTION,
        'def plain(instance):',
        '    with transaction.atomic():',
        '        instance.save()',
        '        Item.objects.filter(name="a").delete()',
      ),
      [],
    ],
    [
      'a manager of something that is not a project model',
      code('def names(using, registry):', '    return list(registry.objects.all())'),
      [],
    ],
    [
      'a data migration function that binds the alias',
      code(
        'def forwards(apps, schema_editor):',
        '    alias = schema_editor.connection.alias',
        '    Item = apps.get_model("shop", "Item")',
        '    Item.objects.using(alias).filter(name="a").update(name="b")',
      ),
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_paths.py',
        code: code('def test_paths(using):', '    assert Item.objects.filter(name="a").count()'),
      },
      [],
    ],
  ]);

  itOutcomes('flags a model that shares its name with a model of another app', [
    [
      'two models called Panel',
      {
        files: {
          'a/models.py': code(
            'from django.db import models',
            '',
            '',
            'class Panel(models.Model):',
            '    n = models.IntegerField()',
          ),
          'b/models.py': code(
            'from django.db import models',
            '',
            '',
            'class Panel(models.Model):',
            '    n = models.IntegerField()',
          ),
          'settings.py': SEVERAL,
          'views.py': code('def count(using):', '    return Panel.objects.filter(n=1).count()'),
        },
      },
      [`${RULE}:2 count|Panel.objects|using`],
    ],
  ]);

  itOutcomes('flags a current model in a data migration even with one database', [
    [
      'functions given to RunPython',
      {
        files: {
          'models.py': MODELS,
          'settings.py': SINGLE,
          'renaming.py': code(
            'def rename_all():',
            '    return Item.objects.all().update(name="x")',
          ),
          'migration.py': code(
            'from django.db import migrations',
            'from shop.models import Item',
            'from shop.renaming import rename_all',
            '',
            '',
            'def forwards(apps, schema_editor):',
            '    Item.objects.filter(name="a").update(name="b")',
            '',
            '',
            'def backwards(apps, schema_editor):',
            '    rename_all()',
            '',
            '',
            'def other(apps, schema_editor):',
            '    Item.objects.filter(name="a").update(name="b")',
            '',
            '',
            'def good(apps, schema_editor):',
            '    Model = apps.get_model("shop", "Item")',
            '    Model.objects.using(schema_editor.connection.alias).update(name="b")',
            '',
            '',
            'operations = [migrations.RunPython(forwards, backwards), migrations.RunPython(good)]',
          ),
        },
      },
      [
        `${RULE}:7 forwards|Item.objects|schema_editor.connection.alias|historical`,
        `${RULE}:11 backwards|rename_all()|schema_editor.connection.alias|historical`,
      ],
    ],
    [
      'a function that returns early off the default database',
      {
        files: {
          'guarded.py': code(
            'from django.db import migrations',
            'from shop.renaming import rename_all',
            '',
            '',
            'def forwards(apps, schema_editor):',
            '    if schema_editor.connection.alias != "default":',
            '        return',
            '    rename_all()',
            '',
            '',
            'operations = [migrations.RunPython(forwards)]',
          ),
        },
      },
      [],
    ],
  ]);

  itOutcomes('stays quiet in a project with one database', [
    [
      'settings with only the default alias',
      {
        files: {
          'models.py': MODELS,
          'settings.py': SINGLE,
          'receivers.py': code(
            ...RECEIVER,
            'def update_paths(instance, using, **kwargs):',
            '    CablePath.objects.filter(origin=instance).delete()',
          ),
        },
      },
      [],
    ],
  ]);

  itOutcomes('stays quiet in a project without database settings', [
    [
      'no DATABASES setting',
      {
        files: {
          'models.py': MODELS,
          'receivers.py': code(
            ...RECEIVER,
            'def update_paths(instance, using, **kwargs):',
            '    CablePath.objects.filter(origin=instance).delete()',
          ),
        },
      },
      [],
    ],
  ]);
});
