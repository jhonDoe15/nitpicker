import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts({
  hidden: ['unindexed-foreign-key', 'eager-relationship', 'io-in-loop', 'unordered-query'],
});
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const MODELS = code(
  'from django.db import models',
  '',
  '',
  'class Customer(models.Model):',
  '    name = models.CharField(max_length=10)',
  '',
  '',
  'class Order(models.Model):',
  '    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)',
);
const SQLALCHEMY = code(
  'from sqlalchemy import ForeignKey, select',
  'from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship',
  '',
  '',
  'class Base(DeclarativeBase):',
  '    pass',
  '',
  '',
  'class Customer(Base):',
  '    __tablename__ = "customer"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '',
  '',
  'class Order(Base):',
  '    __tablename__ = "order"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '    customer_id: Mapped[int] = mapped_column(ForeignKey("customer.id"))',
  '    customer: Mapped[Customer] = relationship(lazy=STRATEGY)',
  '',
  '',
  'STRATEGY = "select"',
  '',
  '',
  'def names(session):',
  '    return [o.customer.id for o in session.scalars(select(Order))]',
);
const run = (body) =>
  findingsOf(
    {
      'src/shop/models.py': MODELS,
      'src/shop/views.py': `from django.db.models import prefetch_related_objects\n\nfrom shop.models import Order\n\n\n${body}\n`,
    },
    { sourceRoots: ['src'] },
  );

describe.skipIf(!enabled)('lazy-relation-in-loop with explicit loading', () => {
  it('stays quiet after prefetch_related_objects or a refresh of the row', () => {
    expect(
      run(
        code(
          'def prefetched():',
          '    orders = list(Order.objects.all())',
          '    prefetch_related_objects(orders, "customer")',
          '    return [o.customer.name for o in orders]',
          '',
          '',
          'def refreshed():',
          '    out = []',
          '    for o in Order.objects.all():',
          '        o.refresh_from_db(fields=["customer"])',
          '        out.append(o.customer.name)',
          '    return out',
        ),
      ),
    ).toEqual([]);
  });

  it('does not treat a slice of one row as a loop, and still flags a full queryset', () => {
    expect(
      run(
        code(
          'def first_only():',
          '    for o in Order.objects.all()[:1]:',
          '        print(o.customer.name)',
          '',
          '',
          'def everything():',
          '    return [o.customer.name for o in Order.objects.all()]',
        ),
      ),
    ).toEqual([
      'lazy-relation-in-loop src/shop/views.py:12 Order.customer|django|Order.objects.all()',
    ]);
  });

  it('stays quiet when the lazy strategy is not a constant', () => {
    expect(findingsOf({ 'src/shop/a.py': SQLALCHEMY }, { sourceRoots: ['src'] })).toEqual([]);
  });
});
