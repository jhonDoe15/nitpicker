import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({ enabled, hidden: ['test-without-assertion'] });

const HEAD = [
  'from functools import reduce',
  'from operator import or_',
  'from django.db.models import Q',
  '',
  '',
];

describe.skipIf(!enabled)('empty-filter-condition', () => {
  itOutcomes('flags a filter that can be built without conditions', [
    [
      'an empty Q on the else branch',
      code(
        ...HEAD,
        'def interfaces(self):',
        '    return Interface.objects.filter(Q(device=self) if self.pk else Q())',
      ),
      ['empty-filter-condition:7 filter|branch|Q(device=self) if self.pk else...'],
    ],
    [
      'an empty Q in an or fallback',
      code(...HEAD, 'def find(extra):', '    return User.objects.filter(extra or Q())'),
      ['empty-filter-condition:7 filter|branch|extra or Q()'],
    ],
    [
      'a Q held in a variable with an empty branch',
      code(
        ...HEAD,
        'def find(self):',
        '    condition = Q(device=self) if self.pk else Q()',
        '    return Interface.objects.exclude(condition)',
      ),
      ['empty-filter-condition:8 exclude|branch|condition'],
    ],
    [
      'reduce that starts from an empty Q',
      code(
        ...HEAD,
        'def members(ids):',
        '    return User.objects.filter(reduce(or_, (Q(pk=m) for m in ids), Q()))',
      ),
      ['empty-filter-condition:7 filter|reduce|reduce(or_, (Q(pk=m) for m in ...'],
    ],
    [
      'a loop that fills a Q that starts empty',
      code(
        ...HEAD,
        'def members(ids):',
        '    query = Q()',
        '    for member in ids:',
        '        query |= Q(pk=member)',
        '    return User.objects.filter(query)',
      ),
      ['empty-filter-condition:10 filter|loop|query'],
    ],
    [
      'the Q imported through the models module',
      code(
        'from django.db import models',
        '',
        '',
        'def find(self):',
        '    return Item.objects.get(models.Q() if self.pk else models.Q(a=1))',
      ),
      ['empty-filter-condition:5 get|branch|models.Q() if self.pk else mod...'],
    ],
  ]);

  itOutcomes('flags SQLAlchemy or_ and and_ that can be empty', [
    [
      'or_ without arguments',
      code(
        'from sqlalchemy import or_, select',
        '',
        '',
        'def find(model):',
        '    return select(model).where(or_())',
      ),
      ['empty-filter-condition:5 where|sql-empty|or_()'],
    ],
    [
      'or_ spread over a list that can be empty',
      code(
        'import sqlalchemy as sa',
        '',
        '',
        'def find(session, model, conditions):',
        '    return session.query(model).filter(sa.or_(*conditions))',
      ),
      ['empty-filter-condition:5 filter|sql-spread|sa.or_(*conditions)'],
    ],
    [
      'or_ spread over a generator of the items',
      code(
        'from sqlalchemy import or_',
        '',
        '',
        'def find(query, model, ids):',
        '    return query.where(or_(*(model.id == i for i in ids)))',
      ),
      ['empty-filter-condition:5 where|sql-spread|or_(*(model.id == i for i in i...'],
    ],
  ]);

  itOutcomes('stays quiet for the allowed forms', [
    [
      'an AND accumulation that starts empty',
      code(
        ...HEAD,
        'def search(params):',
        '    query = Q()',
        '    for key, value in params.items():',
        '        query &= Q(**{key: value})',
        '    return User.objects.filter(query)',
      ),
      [],
    ],
    [
      'a reduce with and_',
      code(
        'from functools import reduce',
        'from operator import and_',
        'from django.db.models import Q',
        '',
        '',
        'def search(parts):',
        '    return User.objects.filter(reduce(and_, parts, Q()))',
      ),
      [],
    ],
    [
      'and_ spread over the optional filters',
      code(
        'from sqlalchemy import and_',
        '',
        '',
        'def search(query, conditions):',
        '    return query.where(and_(*conditions))',
      ),
      [],
    ],
    [
      'or_ spread over a literal list with items',
      code(
        'from sqlalchemy import or_',
        '',
        '',
        'def search(query, a, b):',
        '    conditions = [a, b]',
        '    return query.where(or_(*conditions))',
      ),
      [],
    ],
    [
      'or_ spread after a walrus check',
      code(
        'from sqlalchemy import or_',
        '',
        '',
        'def search(query, ids, model):',
        '    if (conditions := [model.id == i for i in ids]):',
        '        return query.where(or_(*conditions))',
        '    return query',
      ),
      [],
    ],
    [
      'or_ spread after a length check',
      code(
        'from sqlalchemy import or_',
        '',
        '',
        'def search(query, conditions):',
        '    if not len(conditions):',
        '        raise ValueError("none")',
        '    return query.where(or_(*conditions))',
      ),
      [],
    ],
    [
      'or_ spread after an emptiness check',
      code(
        'from sqlalchemy import or_',
        '',
        '',
        'def find(query, conditions):',
        '    if not conditions:',
        '        return []',
        '    return query.where(or_(*conditions))',
      ),
      [],
    ],
    [
      'or_ with explicit arguments',
      code(
        'from sqlalchemy import or_',
        '',
        '',
        'def find(query, a, b):',
        '    return query.where(or_(a, b))',
      ),
      [],
    ],
    [
      'an or_ that is not the SQLAlchemy one',
      code('from operator import or_', '', '', 'def find(query):', '    return query.where(or_())'),
      [],
    ],
    [
      'none() for the empty case',
      code(
        ...HEAD,
        'def interfaces(self):',
        '    if self.pk:',
        '        return Interface.objects.filter(device=self)',
        '    return Interface.objects.none()',
      ),
      [],
    ],
    [
      'pk__in with a list',
      code(...HEAD, 'def members(ids):', '    return User.objects.filter(pk__in=ids)'),
      [],
    ],
    [
      'a loop whose iterable is checked first',
      code(
        ...HEAD,
        'def members(ids):',
        '    if not ids:',
        '        return User.objects.none()',
        '    query = Q()',
        '    for member in ids:',
        '        query |= Q(pk=member)',
        '    return User.objects.filter(query)',
      ),
      [],
    ],
    [
      'a loop whose Q is checked first',
      code(
        ...HEAD,
        'def members(ids):',
        '    query = Q()',
        '    for member in ids:',
        '        query |= Q(pk=member)',
        '    if not query:',
        '        return []',
        '    return User.objects.filter(query)',
      ),
      [],
    ],
    [
      'a Q with conditions on both branches',
      code(
        ...HEAD,
        'def find(self):',
        '    return Item.objects.filter(Q(a=1) if self.pk else Q(b=2))',
      ),
      [],
    ],
    [
      'a Q that is not the Django one',
      code(
        'from queue import Queue as Q',
        '',
        '',
        'def find(self, rows):',
        '    return rows.filter(Q() if self else Q())',
      ),
      [],
    ],
    [
      'reduce that starts from a Q with a condition',
      code(
        ...HEAD,
        'def members(ids):',
        '    return User.objects.filter(reduce(or_, (Q(pk=m) for m in ids), Q(pk=0)))',
      ),
      [],
    ],
  ]);
});
