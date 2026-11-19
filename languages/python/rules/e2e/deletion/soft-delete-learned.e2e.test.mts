import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({
  enabled,
  hidden: ['test-without-assertion', 'io-in-loop', 'repeated-string-literal', 'unordered-query'],
});

const RULE = 'soft-delete-filter-missing';
const model = (name: string, ...fields: string[]) =>
  code('from django.db import models', '', '', `class ${name}(models.Model):`, ...fields);
const reads = (name: string, kwargs: string, count = 5) =>
  Array.from(
    { length: count },
    (_, index) =>
      `def r${String(index)}(): return ${name}.objects.filter(${kwargs}, n=${String(index)}).count()`,
  );
const project = (name: string, fields: string[], ...views: string[]) => ({
  files: {
    'models.py': model(name, ...fields),
    'views.py': code(`from shop.models import ${name}`, '', ...views),
  },
});

describe.skipIf(!enabled)('soft-delete-filter-missing activity flags', () => {
  itOutcomes('reports a read that skips the flag most reads of the model filter on', [
    [
      'an active flag on a boolean field',
      project(
        'Subscription',
        ['    active = models.BooleanField(default=True)'],
        ...reads('Subscription', 'active=True'),
        'def late(ids): return Subscription.objects.filter(user_id__in=ids).count()',
      ),
      [`${RULE}:8 late|Subscription|active|active=True|5 of 6`],
    ],
    [
      'a flag reached through a relation',
      project(
        'Membership',
        ['    user = models.ForeignKey("auth.User", on_delete=models.CASCADE)'],
        ...reads('Membership', 'user__is_active=True'),
        'def by_email(email): return Membership.objects.filter(user__email=email).first()',
      ),
      [`${RULE}:8 by_email|Membership|user__is_active|user__is_active=True|5 of 6`],
    ],
    [
      'an internal flag filtered with exclude and with a value',
      project(
        'Channel',
        ['    internal = models.BooleanField(default=False)'],
        'def a(): return Channel.objects.filter(internal=False).count()',
        'def b(): return Channel.objects.exclude(internal=True).count()',
        'def c(): return Channel.objects.filter(internal__exact=False).count()',
        'def d(): return Channel.objects.exclude(internal=True, n=1).first()',
        'def e(): return Channel.objects.filter(n=2, internal=False).first()',
        'def f(pk): return Channel.objects.filter(pk=pk).first()',
      ),
      [`${RULE}:8 f|Channel|internal|internal=False|5 of 6`],
    ],
    [
      'a primary key lookup with get and a shortcut',
      project(
        'Folder',
        ['    is_enabled = models.BooleanField(default=True)'],
        'from django.shortcuts import get_object_or_404',
        ...reads('Folder', 'is_enabled=True', 8),
        'def one(pk): print(Folder.objects.get(pk=pk))',
        'def two(pk): return get_object_or_404(Folder, pk=pk)',
        'def ok(pk): return get_object_or_404(Folder, pk=pk, is_enabled=True)',
      ),
      [
        `${RULE}:12 one|Folder|is_enabled|is_enabled=True|9 of 11`,
        `${RULE}:13 two|Folder|is_enabled|is_enabled=True|9 of 11`,
      ],
    ],
    [
      'any boolean field that most reads filter on with the same value',
      project(
        'Post',
        ['    published = models.BooleanField(default=False)'],
        ...reads('Post', 'published=True'),
        'def feed(): return Post.objects.filter(n=9).count()',
      ),
      [`${RULE}:8 feed|Post|published|published=True|5 of 6`],
    ],
  ]);

  itOutcomes('stays quiet where the flag is not the project rule or is applied', [
    [
      'a flag stored on a dict, a row or passed on with keyword arguments',
      project(
        'Lamp',
        ['    active = models.BooleanField(default=True)'],
        ...reads('Lamp', 'active=True'),
        'def a():',
        '    q = {}',
        '    q["active"] = True',
        '    return Lamp.objects.filter(**q).count()',
        'def b():',
        '    for m in Lamp.objects.filter(n=1):',
        '        m.active = True',
        'def c(**extra): return Lamp.objects.filter(n=2, **extra).count()',
      ),
      [],
    ],
    [
      'a share below the threshold',
      project(
        'Device',
        ['    active = models.BooleanField(default=True)'],
        ...reads('Device', 'active=True', 3),
        'def a(): return Device.objects.filter(n=1).count()',
        'def b(): return Device.objects.filter(n=2).count()',
        'def c(): return Device.objects.filter(n=3).count()',
      ),
      [],
    ],
    [
      'fewer than five reads',
      project(
        'Gadget',
        ['    active = models.BooleanField(default=True)'],
        ...reads('Gadget', 'active=True', 3),
        'def a(): return Gadget.objects.filter(n=1).count()',
      ),
      [],
    ],
    [
      'a read that asks for the other value on purpose',
      project(
        'Account',
        ['    active = models.BooleanField(default=True)'],
        ...reads('Account', 'active=True'),
        'def dormant(): return Account.objects.filter(active=False).count()',
      ),
      [],
    ],
    [
      'a flag applied to a queryset after it is assigned',
      project(
        'Seat',
        ['    active = models.BooleanField(default=True)'],
        ...reads('Seat', 'active=True'),
        'def later():',
        '    rows = Seat.objects.filter(n=1)',
        '    return rows.filter(active=True).count()',
      ),
      [],
    ],
    [
      'trash and restore functions',
      project(
        'Ticket',
        ['    active = models.BooleanField(default=True)'],
        ...reads('Ticket', 'active=True'),
        'def trash_tickets(): return Ticket.objects.filter(n=1).count()',
        'def restore_tickets(): return Ticket.objects.filter(n=2).count()',
      ),
      [],
    ],
    [
      'a default manager that filters',
      {
        files: {
          'models.py': code(
            'from django.db import models',
            '',
            '',
            'class LiveManager(models.Manager):',
            '    def get_queryset(self):',
            '        return super().get_queryset().filter(active=True)',
            '',
            '',
            'class Card(models.Model):',
            '    active = models.BooleanField(default=True)',
            '    objects = LiveManager()',
          ),
          'views.py': code(
            'from shop.models import Card',
            '',
            ...reads('Card', 'active=True'),
            'def one(): return Card.objects.filter(n=7).count()',
          ),
        },
      },
      [],
    ],
    [
      'a function that receives a queryset',
      project(
        'Badge',
        ['    active = models.BooleanField(default=True)'],
        ...reads('Badge', 'active=True'),
        'def narrow(rows): return rows.filter(n=1).count()',
      ),
      [],
    ],
    [
      'a model without a boolean field or activity name',
      project(
        'Note',
        ['    title = models.CharField()'],
        ...reads('Note', 'title="a"'),
        'def one(): return Note.objects.filter(n=1).count()',
      ),
      [],
    ],
    [
      'reads in test files',
      {
        files: {
          'models.py': model('Probe', '    active = models.BooleanField(default=True)'),
          'views.py': code('from shop.models import Probe', '', ...reads('Probe', 'active=True')),
          'tests/test_probe.py': code(
            'from shop.models import Probe',
            '',
            'def test_one(): assert Probe.objects.filter(n=1).count()',
          ),
        },
      },
      [],
    ],
  ]);
});

const restricted = (name: string) => ({
  'models.py': code(
    'from django.db import models',
    '',
    '',
    'class RestrictedQuerySet(models.QuerySet):',
    '    def restrict(self, user, action="view"):',
    '        return self.filter(owner=user)',
    '',
    '',
    `class ${name}(models.Model):`,
    '    objects = RestrictedQuerySet.as_manager()',
  ),
});
const scoped = (name: string) =>
  Array.from({ length: 5 }, (_, index) => {
    const scope = `${name}.objects.restrict(request.user, "view")`;
    return `def r${String(index)}(request): return ${scope}.filter(n=${String(index)}).count()`;
  });

describe.skipIf(!enabled)('soft-delete-filter-missing user scoping helpers', () => {
  itOutcomes('reports a read that skips the helper most reads in views call', [
    [
      'a restrict method taking the user',
      {
        files: {
          ...restricted('ImageAttachment'),
          'views.py': code(
            'from shop.models import ImageAttachment',
            '',
            ...scoped('ImageAttachment'),
            'def images(request, obj): return ImageAttachment.objects.filter(object_id=obj.pk).first()',
          ),
        },
      },
      [`${RULE}:8 images|ImageAttachment|restrict()|restrict()|5 of 6`],
    ],
  ]);

  itOutcomes('stays quiet where the helper cannot or need not be applied', [
    [
      'a queryset assigned to a name that then calls the helper',
      {
        files: {
          ...restricted('Image'),
          'views.py': code(
            'from shop.models import Image',
            '',
            ...scoped('Image'),
            'def a(request):',
            '    qs = Image.objects.all()',
            '    return qs.restrict(request.user, "view").count()',
            'def b(request):',
            '    img = Image.objects.filter(pk=1)',
            '    return img.restrict(request.user, "view").first()',
          ),
        },
      },
      [],
    ],
    [
      'a read in a function without a user',
      {
        files: {
          ...restricted('Prefix'),
          'views.py': code(
            'from shop.models import Prefix',
            '',
            ...scoped('Prefix'),
            'def count_all(): return Prefix.objects.filter(n=1).count()',
          ),
        },
      },
      [],
    ],
    [
      'a read outside views, forms, serializers and template tags',
      {
        files: {
          ...restricted('Rack'),
          'views.py': code('from shop.models import Rack', '', ...scoped('Rack')),
          'jobs.py': code(
            'from shop.models import Rack',
            '',
            'def nightly(user): return Rack.objects.filter(n=1).count()',
          ),
        },
      },
      [],
    ],
    [
      'a share below the threshold',
      {
        files: {
          ...restricted('Site'),
          'views.py': code(
            'from shop.models import Site',
            '',
            ...scoped('Site').slice(0, 2),
            'def a(request): return Site.objects.filter(n=1).count()',
            'def b(request): return Site.objects.filter(n=2).count()',
            'def c(request): return Site.objects.filter(n=3).count()',
          ),
        },
      },
      [],
    ],
    [
      'a method that does not take the user',
      {
        files: {
          'models.py': code(
            'from django.db import models',
            '',
            '',
            'class LiveQuerySet(models.QuerySet):',
            '    def live(self):',
            '        return self.filter(n=1)',
            '',
            '',
            'class Wire(models.Model):',
            '    objects = LiveQuerySet.as_manager()',
          ),
          'views.py': code(
            'from shop.models import Wire',
            '',
            ...Array.from(
              { length: 5 },
              (_, index) => `def r${String(index)}(request): return Wire.objects.live()`,
            ),
            'def one(request): return Wire.objects.filter(n=1).count()',
          ),
        },
      },
      [],
    ],
  ]);
});
