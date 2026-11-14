import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: ['test-without-assertion', 'io-in-loop', 'repeated-string-literal', 'unordered-query'],
});
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const djangoModel = (name) =>
  code(
    'from django.db import models',
    '',
    '',
    `class ${name}(models.Model):`,
    '    deleted_at = models.DateTimeField(null=True)',
  );
const filtered = (name) => [
  `from shop.models import ${name}`,
  '',
  `def a(): return ${name}.objects.filter(deleted_at__isnull=True)`,
  `def b(): return ${name}.objects.filter(deleted_at=None, total=1).first()`,
  `def c(): return ${name}.objects.exclude(deleted_at__isnull=False).count()`,
  `def d(): return ${name}.objects.filter(deleted_at__isnull=True).get(pk=1)`,
  `def e(): return list(${name}.objects.filter(deleted_at__isnull=True)[:5])`,
];
const sqlModel = (name) => [
  'from sqlalchemy import Column, DateTime, Integer, select',
  'from sqlalchemy.orm import declarative_base',
  '',
  'Base = declarative_base()',
  '',
  '',
  `class ${name}(Base):`,
  '    __tablename__ = "items"',
  '    id = Column(Integer, primary_key=True)',
  '    deleted_at = Column(DateTime)',
  '',
  '',
];
const sqlFiltered = (name) => [
  `def a(s): return s.query(${name}).filter(${name}.deleted_at.is_(None)).all()`,
  `def b(s): return s.query(${name}).filter(${name}.deleted_at.is_(None)).count()`,
  `def c(s): return s.scalars(select(${name}).where(${name}.deleted_at.is_(None)))`,
  `def d(s): return s.scalars(select(${name}.id).where(${name}.deleted_at.is_(None)))`,
  `def e(s): return s.query(${name}).filter(${name}.deleted_at.is_(None), ${name}.id > 1).first()`,
];

const pair = (name, ...views) => ({
  files: { 'models.py': djangoModel(name), 'views.py': code(...filtered(name), ...views) },
});
const sqlPair = (name, ...repo) => ({
  files: {
    'models.py': code(...sqlModel(name), ...sqlFiltered(name)),
    'repo.py': code(`from models import ${name}`, '', ...repo),
  },
});

describe.skipIf(!enabled)('soft-delete-filter-missing', () => {
  it('reports a read that skips the filter most reads of the model apply', () => {
    const [actual, expected] = outcomes([
      [
        'a Django count without the filter',
        pair('Order', 'def f(): return Order.objects.filter(total=3).count()'),
        ['soft-delete-filter-missing:8 f|Order|deleted_at|deleted_at|5 of 6'],
      ],
      [
        'a Django loop over all rows',
        pair('Invoice', 'def f():', '    for row in Invoice.objects.all():', '        print(row)'),
        ['soft-delete-filter-missing:9 f|Invoice|deleted_at|deleted_at|5 of 6'],
      ],
      [
        'a query that the project filters with a helper',
        {
          files: {
            'models.py': code(
              'from django.db import models',
              '',
              '',
              'class ParcelQuerySet(models.QuerySet):',
              '    def alive(self):',
              '        return self.filter(deleted_at__isnull=True)',
              '',
              '',
              'class Parcel(models.Model):',
              '    deleted_at = models.DateTimeField(null=True)',
              '    objects = ParcelQuerySet.as_manager()',
            ),
            'views.py': code(
              'from shop.models import Parcel',
              '',
              'def a(): return Parcel.objects.alive()',
              'def b(): return Parcel.objects.alive().filter(total=1)',
              'def c(): return Parcel.objects.alive().count()',
              'def d(): return Parcel.objects.alive().first()',
              'def e(): return list(Parcel.objects.alive())',
              'def f(): return Parcel.objects.filter(total=3).count()',
            ),
          },
        },
        ['soft-delete-filter-missing:8 f|Parcel|deleted_at|alive()|5 of 6'],
      ],
      [
        'a SQLAlchemy query without the criteria',
        sqlPair('Item', 'def f(s): return s.query(Item).filter(Item.id == 2).first()'),
        ['soft-delete-filter-missing:3 f|Item|deleted_at|deleted_at|5 of 6'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('stays quiet below the threshold, on trash code and where the default filters', () => {
    const [actual, expected] = outcomes([
      [
        'a project that mostly does not filter',
        {
          files: {
            'models.py': djangoModel('Ticket'),
            'views.py': code(
              'from shop.models import Ticket',
              '',
              'def a(): return Ticket.objects.filter(deleted_at__isnull=True)',
              'def b(): return Ticket.objects.filter(total=1).count()',
              'def c(): return Ticket.objects.filter(total=2).count()',
              'def d(): return Ticket.objects.filter(total=3).count()',
              'def e(): return Ticket.objects.filter(total=4).count()',
            ),
          },
        },
        [],
      ],
      [
        'a trash view and a restore function',
        pair(
          'Refund',
          'def trash(): return Refund.objects.filter(total=3).count()',
          'def restore_refunds(): return Refund.objects.filter(total=4).count()',
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
              '        return super().get_queryset().filter(deleted_at__isnull=True)',
              '',
              '',
              'class Coupon(models.Model):',
              '    deleted_at = models.DateTimeField(null=True)',
              '    objects = LiveManager()',
            ),
            'views.py': code(
              ...filtered('Coupon'),
              'def f(): return Coupon.objects.filter(total=3).count()',
            ),
          },
        },
        [],
      ],
      [
        'a queryset that a function filters further',
        pair(
          'Basket',
          'def f():',
          '    rows = Basket.objects.all()',
          '    return rows.filter(deleted_at__isnull=True)',
        ),
        [],
      ],
      [
        'a SQLAlchemy loader criteria for the model',
        sqlPair(
          'Review',
          'from sqlalchemy.orm import with_loader_criteria',
          '',
          'def f(s): return s.query(Review).filter(Review.id == 2).first()',
          'def g(stmt): return stmt.options(with_loader_criteria(Review, Review.deleted_at.is_(None)))',
        ),
        [],
      ],
      [
        'rows filtered in the enclosing comprehension, loop, predicate or method',
        pair(
          'Ledger',
          'ACTIVE = {"deleted_at": None}',
          'def f(c): return [o for o in Ledger.objects.filter(c) if o.deleted_at is None]',
          'def g(c):',
          '    for o in Ledger.objects.filter(c):',
          '        if o.deleted_at:',
          '            continue',
          '        print(o)',
          'def h(c): return list(filter(lambda o: not o.deleted_at, Ledger.objects.filter(c)))',
          'def i(c): return sum(o.total for o in Ledger.objects.filter(c) if not o.deleted_at)',
          'def j(c):',
          '    rows = Ledger.objects.filter(c)',
          '    return [o for o in rows if not o.deleted_at]',
          'def k(c): return Ledger.objects.filter(**ACTIVE)',
        ),
        [],
      ],
      [
        'a model with no soft-delete column',
        {
          files: {
            'models.py': code(
              'from django.db import models',
              '',
              '',
              'class Tag(models.Model):',
              '    name = models.CharField()',
            ),
            'views.py': code(
              'from shop.models import Tag',
              '',
              'def a(): return Tag.objects.filter(name="a")',
              'def b(): return Tag.objects.filter(name="b")',
              'def c(): return Tag.objects.filter(name="c").count()',
              'def d(): return Tag.objects.filter(name="d").count()',
              'def e(): return Tag.objects.filter(name="e").first()',
              'def f(): return Tag.objects.all().count()',
            ),
          },
        },
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
