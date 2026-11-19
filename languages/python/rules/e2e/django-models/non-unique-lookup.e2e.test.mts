import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({ enabled, hidden: ['test-without-assertion'] });

const MODELS = [
  'from django.db import models',
  'from django.db.models import Q',
  '',
  '',
  'class Group(models.Model):',
  '    name = models.CharField(max_length=20)',
  '    slug = models.SlugField(unique=True)',
  '    attributes = models.JSONField(default=dict)',
  '    notes = models.TextField()',
  '    site = models.ForeignKey("Site", on_delete=models.CASCADE)',
  '    code = models.CharField(max_length=5)',
  '    owner = models.ForeignKey("Owner", on_delete=models.CASCADE)',
  '    rank = models.IntegerField()',
  '',
  '    class Meta:',
  '        unique_together = (("site", "code"),)',
  '        constraints = [',
  '            models.UniqueConstraint(fields=["owner", "rank"], condition=Q(rank__gt=0), name="r"),',
  '        ]',
  '',
  '',
  'class Site(models.Model):',
  '    name = models.CharField(max_length=20)',
  '',
  '',
  'class Owner(models.Model):',
  '    name = models.CharField(max_length=20)',
  '',
  '',
];

describe.skipIf(!enabled)('non-unique-lookup', () => {
  itOutcomes('flags lookups that the model does not keep unique', [
    [
      'get by a plain field',
      code(...MODELS, 'def find(name):', '    return Group.objects.get(name=name)'),
      ['non-unique-lookup:31 Group.get|not-unique|name'],
    ],
    [
      'get by an or of Q objects',
      code(...MODELS, 'def find(a, b):', '    return Group.objects.get(Q(slug=a) | Q(name=b))'),
      ['non-unique-lookup:31 Group.get|q-or|slug,name'],
    ],
    [
      'get_or_create by a plain field',
      code(
        ...MODELS,
        'def find(name):',
        '    return Group.objects.get_or_create(name=name, defaults={"code": "x"})',
      ),
      ['non-unique-lookup:31 Group.get_or_create|not-unique|name'],
    ],
    [
      'get_or_create with a JSON field in the lookup',
      code(
        ...MODELS,
        'def find(slug, attrs):',
        '    return Group.objects.get_or_create(slug=slug, attributes=attrs)',
      ),
      ['non-unique-lookup:31 Group.get_or_create|mutable|attributes'],
    ],
    [
      'update_or_create with a text field in the lookup',
      code(
        ...MODELS,
        'def find(slug, text):',
        '    return Group.objects.update_or_create(slug=slug, notes=text)',
      ),
      ['non-unique-lookup:31 Group.update_or_create|mutable|notes'],
    ],
    [
      'a lookup of part of a unique set',
      code(...MODELS, 'def find(site):', '    return Group.objects.get(site=site)'),
      ['non-unique-lookup:31 Group.get|not-unique|site'],
    ],
    [
      'get on a filtered queryset that does not complete the constraint',
      code(
        ...MODELS,
        'def find(site, name):',
        '    return Group.objects.filter(site=site).get(name=name)',
      ),
      ['non-unique-lookup:31 Group.get|not-unique|name,site'],
    ],
  ]);

  itOutcomes('resolves related managers through the reverse accessors', [
    [
      'a reverse accessor of a typed parameter',
      code(...MODELS, 'def find(site: Site, name):', '    return site.group_set.get(name=name)'),
      ['non-unique-lookup:31 Group.get|not-unique|name'],
    ],
    [
      'a reverse accessor of a fetched row',
      code(
        ...MODELS,
        'def find(pk, name):',
        '    site = Site.objects.get(pk=pk)',
        '    return site.group_set.filter(rank=1).get(name=name)',
      ),
      ['non-unique-lookup:32 Group.get|not-unique|name,rank'],
    ],
    [
      'a reverse accessor that the parent scope makes unique',
      code(...MODELS, 'def find(site: Site, code):', '    return site.group_set.get(code=code)'),
      [],
    ],
    [
      'a reverse accessor of an untyped parameter',
      code(...MODELS, 'def find(site, name):', '    return site.group_set.get(name=name)'),
      [],
    ],
    [
      'an attribute that is not a reverse accessor',
      code(...MODELS, 'def find(site: Site, name):', '    return site.cache.get(name=name)'),
      [],
    ],
  ]);

  itOutcomes('stays quiet for unique lookups and the allowed forms', [
    [
      'a lookup through a one-to-one to a unique field',
      code(
        'from django.db import models',
        '',
        '',
        'class Account(models.Model):',
        '    username = models.CharField(max_length=5, unique=True)',
        '',
        '',
        'class Profile(models.Model):',
        '    user = models.OneToOneField(Account, on_delete=models.CASCADE)',
        '',
        '',
        'def find(name):',
        '    return Profile.objects.get(user__username=name)',
      ),
      [],
    ],
    [
      'a lookup through a one-to-one to a model outside the project',
      code(
        'from django.db import models',
        'from django.contrib.auth.models import User',
        '',
        '',
        'class Profile(models.Model):',
        '    user = models.OneToOneField(User, on_delete=models.CASCADE)',
        '',
        '',
        'def find(name):',
        '    return Profile.objects.get(user__username=name)',
      ),
      [],
    ],
    [
      'get by primary key',
      code(...MODELS, 'def find(pk):', '    return Group.objects.get(pk=pk)'),
      [],
    ],
    [
      'get by a unique field',
      code(...MODELS, 'def find(slug):', '    return Group.objects.get(slug=slug)'),
      [],
    ],
    [
      'get by every field of unique_together',
      code(
        ...MODELS,
        'def find(site, code):',
        '    return Group.objects.get(site=site, code=code)',
      ),
      [],
    ],
    [
      'get by the foreign key id column',
      code(
        ...MODELS,
        'def find(site_id, code):',
        '    return Group.objects.get(site_id=site_id, code=code)',
      ),
      [],
    ],
    [
      'get by a conditional unique constraint',
      code(
        ...MODELS,
        'def find(owner, rank):',
        '    return Group.objects.get(owner=owner, rank=rank)',
      ),
      [],
    ],
    [
      'a filtered queryset that completes the constraint',
      code(
        ...MODELS,
        'def find(site, code):',
        '    return Group.objects.filter(site=site).get(code=code)',
      ),
      [],
    ],
    [
      'filter and first',
      code(...MODELS, 'def find(name):', '    return Group.objects.filter(name=name).first()'),
      [],
    ],
    [
      'a mutable field in defaults',
      code(
        ...MODELS,
        'def find(slug, attrs):',
        '    return Group.objects.get_or_create(slug=slug, defaults={"attributes": attrs})',
      ),
      [],
    ],
    [
      'a lookup with keyword expansion',
      code(...MODELS, 'def find(**lookup):', '    return Group.objects.get(**lookup)'),
      [],
    ],
    [
      'a lookup by a name the model does not declare',
      code(...MODELS, 'def find(value):', '    return Group.objects.get(computed=value)'),
      [],
    ],
    [
      'a model with a base class outside the project',
      code(
        'from django.db import models',
        'from vendor import Timestamped',
        '',
        '',
        'class Item(Timestamped, models.Model):',
        '    name = models.CharField(max_length=5)',
        '',
        '',
        'def find(name):',
        '    return Item.objects.get(name=name)',
      ),
      [],
    ],
    [
      'a get on something that is not a model manager',
      code('def find(cache, name):', '    return cache.get(name=name)'),
      [],
    ],
  ]);
});
