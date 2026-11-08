import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const RULE = 'in-memory-query';
const DJANGO_MODELS = [
  'from django.db import models',
  '',
  '',
  'class Order(models.Model):',
  '    status = models.CharField(max_length=20)',
  '    total = models.IntegerField()',
  '    created = models.DateTimeField()',
  '    customer = models.ForeignKey("Customer", on_delete=models.CASCADE)',
  '',
  '    @property',
  '    def label(self):',
  '        return self.status.title()',
  '',
].join('\n');
const ALCHEMY_MODELS = [
  'from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column',
  '',
  '',
  'class Base(DeclarativeBase):',
  '    pass',
  '',
  '',
  'class Order(Base):',
  '    __tablename__ = "orders"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '    status: Mapped[str]',
  '    total: Mapped[int]',
  '',
].join('\n');
const DJANGO = 'from .models import Order\n\n\n';
const ALCHEMY = 'from sqlalchemy import select\n\nfrom .models import Order\n\n\n';

const django = (code) => ({
  files: { 'shop/models.py': DJANGO_MODELS, 'shop/orders.py': `${DJANGO}${code}` },
});
const alchemy = (code) => ({
  files: { 'shop/models.py': ALCHEMY_MODELS, 'shop/orders.py': `${ALCHEMY}${code}` },
});

function ruleOutcomes(rows) {
  const [actual, expected] = outcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [
      name,
      found.filter((item) => item.startsWith(`${RULE}:`)),
    ]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('in-memory-query on Django querysets', () => {
  it('reports counts, filters, sorts and aggregates over query rows', () => {
    const [actual, expected] = ruleOutcomes([
      [
        'len of a filtered queryset',
        django('def open_count():\n    return len(Order.objects.filter(status="open"))\n'),
        ['in-memory-query:5 Order count'],
      ],
      [
        'a queryset as an if test',
        django(
          'def has_open():\n    if Order.objects.filter(status="open"):\n        return 1\n    return 0\n',
        ),
        ['in-memory-query:5 Order count'],
      ],
      [
        'a local read once in a truth test',
        django('def has_open():\n    rows = list(Order.objects.all())\n    return not rows\n'),
        ['in-memory-query:6 Order count'],
      ],
      [
        'in_bulk counted',
        django('def found(ids):\n    return bool(Order.objects.in_bulk(ids))\n'),
        ['in-memory-query:5 Order count'],
      ],
      [
        'a comprehension filter on columns',
        django(
          'def open_orders(state):\n    return [o for o in Order.objects.all() if o.status == state]\n',
        ),
        ['in-memory-query:5 Order filter'],
      ],
      [
        'any over a column',
        django(
          'def has_big(limit):\n    return any(o.total > limit for o in Order.objects.all())\n',
        ),
        ['in-memory-query:5 Order filter'],
      ],
      [
        'next with a condition',
        django(
          'def first_open():\n    return next(o for o in Order.objects.all() if o.status == "open")\n',
        ),
        ['in-memory-query:5 Order filter'],
      ],
      [
        'filter() with a lambda on a foreign key id',
        django(
          'def of(customer_id):\n    return list(filter(lambda o: o.customer_id == customer_id, Order.objects.all()))\n',
        ),
        ['in-memory-query:5 Order filter'],
      ],
      [
        'sorted by a column',
        django('def newest():\n    return sorted(Order.objects.all(), key=lambda o: o.created)\n'),
        ['in-memory-query:5 Order sort'],
      ],
      [
        'max with an attrgetter key',
        django(
          'from operator import attrgetter\n\n\ndef biggest():\n    return max(Order.objects.all(), key=attrgetter("total"))\n',
        ),
        ['in-memory-query:8 Order sort'],
      ],
      [
        'sum over a column',
        django(
          'def revenue():\n    rows = Order.objects.filter(status="paid")\n    return sum(o.total for o in rows)\n',
        ),
        ['in-memory-query:6 Order aggregate'],
      ],
      [
        'Counter over a column',
        django(
          'from collections import Counter\n\n\ndef by_status():\n    return Counter(o.status for o in Order.objects.all())\n',
        ),
        ['in-memory-query:8 Order aggregate'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('leaves rows the code uses, computed values and other shapes alone', () => {
    const [actual, expected] = ruleOutcomes([
      [
        'the database counts',
        django('def open_count():\n    return Order.objects.filter(status="open").count()\n'),
        [],
      ],
      [
        'a local read twice',
        django(
          'def report():\n    rows = list(Order.objects.all())\n    if rows:\n        return rows\n    return []\n',
        ),
        [],
      ],
      [
        'a filter on a property',
        django(
          'def labelled(text):\n    return [o for o in Order.objects.all() if o.label == text]\n',
        ),
        [],
      ],
      [
        'a filter that calls a service',
        django(
          'def allowed(policy):\n    return [o for o in Order.objects.all() if policy.allows(o)]\n',
        ),
        [],
      ],
      [
        'a plain map to values',
        django('def totals():\n    return [o.total for o in Order.objects.all()]\n'),
        [],
      ],
      [
        'a read inside a loop',
        django(
          'def per_state(states):\n    rows = list(Order.objects.all())\n    for state in states:\n        yield [o for o in rows if o.status == state]\n',
        ),
        [],
      ],
      [
        'a model the project does not declare',
        'from vendor.models import Invoice\n\n\ndef paid():\n    return [i for i in Invoice.objects.all() if i.paid]\n',
        [],
      ],
      [
        'a list that is not a query',
        'def open_count(orders):\n    return len([o for o in orders if o.status == "open"])\n',
        [],
      ],
      [
        'test files',
        {
          files: {
            'shop/models.py': DJANGO_MODELS,
            'tests/test_orders.py':
              'from shop.models import Order\n\n\ndef test_count():\n    assert len(Order.objects.all()) == 2\n',
          },
        },
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('in-memory-query on SQLAlchemy results', () => {
  it('reports the shapes on session results and leaves database forms alone', () => {
    const [actual, expected] = ruleOutcomes([
      [
        'scalars all counted',
        alchemy(
          'def count(session):\n    return len(session.scalars(select(Order).where(Order.status == "open")).all())\n',
        ),
        ['in-memory-query:7 Order count'],
      ],
      [
        'execute scalars all filtered',
        alchemy(
          'def open_orders(session):\n    rows = session.execute(select(Order)).scalars().all()\n    return [o for o in rows if o.status == "open"]\n',
        ),
        ['in-memory-query:8 Order filter'],
      ],
      [
        'legacy query sorted',
        alchemy(
          'def newest(session):\n    return sorted(session.query(Order).all(), key=lambda o: o.total)\n',
        ),
        ['in-memory-query:7 Order sort'],
      ],
      [
        'awaited scalars summed',
        alchemy(
          'async def revenue(session):\n    rows = (await session.scalars(select(Order))).all()\n    return sum(o.total for o in rows)\n',
        ),
        ['in-memory-query:8 Order aggregate'],
      ],
      [
        'a list sorted in place',
        alchemy(
          'def newest(session):\n    rows = session.scalars(select(Order)).all()\n    rows.sort(key=lambda o: o.total)\n',
        ),
        ['in-memory-query:8 Order sort'],
      ],
      [
        'the database aggregates',
        alchemy(
          'from sqlalchemy import func\n\n\ndef revenue(session):\n    return session.scalar(select(func.sum(Order.total)))\n',
        ),
        [],
      ],
      [
        'a column select counted',
        alchemy(
          'def statuses(session):\n    return len(session.scalars(select(Order.status)).all())\n',
        ),
        ['in-memory-query:7 Order count'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
