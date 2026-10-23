import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;

const DJANGO_MODELS = code(
  'from django.db import models',
  '',
  '',
  'class Customer(models.Model):',
  '    name = models.CharField(max_length=10)',
  '',
  '',
  'class Order(models.Model):',
  '    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)',
  '    tags = models.ManyToManyField("Tag")',
  '',
  '',
  'class Tag(models.Model):',
  '    label = models.CharField(max_length=10)',
  '',
  '',
  'class Item(models.Model):',
  '    order = models.ForeignKey("shop.Order", related_name="lines", on_delete=models.CASCADE)',
  '',
  '',
  'class Profile(models.Model):',
  '    customer = models.OneToOneField(Customer, on_delete=models.CASCADE)',
);

const django = (body, imports = 'from shop.models import Customer, Item, Order, Profile') => ({
  'src/shop/models.py': DJANGO_MODELS,
  'src/shop/views.py': `${imports}\n\n\n${body}\n`,
});
const run = (files) => findingsOf(files, { sourceRoots: ['src'] });

describe.skipIf(!enabled)('lazy-relation-in-loop with Django', () => {
  it('flags a forward relation read per item of a queryset', () => {
    expect(
      run(
        django(
          code(
            'def names():',
            '    out = []',
            '    for order in Order.objects.filter(open=True):',
            '        out.append(order.customer.name)',
            '    return out',
          ),
        ),
      ),
    ).toEqual([
      'lazy-relation-in-loop src/shop/views.py:7 Order.customer|django|Order.objects.filter()',
    ]);
  });

  it('flags a queryset held in a variable, a comprehension and reverse accessors', () => {
    expect(
      run(
        django(
          code(
            'def names():',
            '    orders = Order.objects.all()',
            '    return [o.customer.name for o in orders]',
            '',
            '',
            'def counts():',
            '    customers = Customer.objects.order_by("name")',
            '    return {c.name: c.order_set.count() for c in customers}',
            '',
            '',
            'def lines():',
            '    for order in Order.objects.all():',
            '        print(order.lines.all(), order.tags.filter(label="x"))',
            '',
            '',
            'def profile():',
            '    for customer in Customer.objects.all():',
            '        print(customer.profile)',
          ),
        ),
      ),
    ).toEqual([
      'lazy-relation-in-loop src/shop/views.py:6 Order.customer|django|Order.objects.all()',
      'lazy-relation-in-loop src/shop/views.py:11 Customer.order_set|django|Customer.objects.order_by()',
      'lazy-relation-in-loop src/shop/views.py:16 Order.lines|django|Order.objects.all()',
      'lazy-relation-in-loop src/shop/views.py:16 Order.tags|django|Order.objects.all()',
      'lazy-relation-in-loop src/shop/views.py:21 Customer.profile|django|Customer.objects.all()',
    ]);
  });

  it('stays quiet when the query fetches the relation or the origin is unknown', () => {
    expect(
      run(
        django(
          code(
            'def joined():',
            '    return [o.customer.name for o in Order.objects.select_related("customer")]',
            '',
            '',
            'def prefetched():',
            '    for o in Order.objects.prefetch_related("lines", "tags"):',
            '        print(o.lines.all(), o.tags.all())',
            '',
            '',
            'def nested_join():',
            '    for i in Item.objects.select_related("order__customer"):',
            '        print(i.order.customer)',
            '',
            '',
            'def all_forward():',
            '    for o in Order.objects.select_related():',
            '        print(o.customer)',
            '',
            '',
            'def column():',
            '    return [o.customer_id for o in Order.objects.all()]',
            '',
            '',
            'def values():',
            '    return [o["customer__name"] for o in Order.objects.values("customer__name")]',
            '',
            '',
            'def parameter(orders):',
            '    return [o.customer.name for o in orders]',
            '',
            '',
            'def write(orders):',
            '    for o in Order.objects.all():',
            '        o.customer = None',
            '',
            '',
            'def unrelated():',
            '    for o in Order.objects.all():',
            '        print(o.pk)',
          ),
        ),
      ),
    ).toEqual([]);
  });
});

const SQLALCHEMY_MODELS = code(
  'from sqlalchemy import ForeignKey',
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
  '    orders: Mapped[list["Order"]] = relationship(back_populates="customer")',
  '',
  '',
  'class Order(Base):',
  '    __tablename__ = "order"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '    customer_id: Mapped[int] = mapped_column(ForeignKey("customer.id"))',
  '    customer: Mapped[Customer] = relationship(back_populates="orders")',
  '    lines: Mapped[list["Line"]] = relationship(lazy="selectin")',
  '    notes = relationship("Note", lazy="select", backref="order")',
);

const sqlalchemy = (body) => ({
  'src/shop/models.py': SQLALCHEMY_MODELS,
  'src/shop/queries.py': `from sqlalchemy import select\n\nfrom shop.models import Customer, Order\n\n\n${body}\n`,
});

describe.skipIf(!enabled)('lazy-relation-in-loop with SQLAlchemy', () => {
  it('flags a lazy relationship read per item of a select, query or execute', () => {
    expect(
      run(
        sqlalchemy(
          code(
            'def a(session):',
            '    for order in session.scalars(select(Order).where(Order.id > 1)):',
            '        print(order.customer.id)',
            '',
            '',
            'def b(session):',
            '    orders = session.scalars(select(Order)).all()',
            '    return [o.customer for o in orders]',
            '',
            '',
            'def c(session):',
            '    for o in session.query(Order).filter(Order.id > 1).all():',
            '        print(o.notes)',
            '',
            '',
            'def d(session):',
            '    for c in session.execute(select(Customer)).scalars().all():',
            '        print(len(c.orders))',
            '',
            '',
            'def e(session):',
            '    stmt = select(Order).order_by(Order.id)',
            '    for o in session.scalars(stmt):',
            '        print(o.customer)',
            '',
            '',
            'async def f(session):',
            '    for c in (await session.scalars(select(Customer))).all():',
            '        print(c.orders)',
          ),
        ),
      ),
    ).toEqual([
      'lazy-relation-in-loop src/shop/queries.py:8 Order.customer|sqlalchemy|select(Order)',
      'lazy-relation-in-loop src/shop/queries.py:13 Order.customer|sqlalchemy|select(Order)',
      'lazy-relation-in-loop src/shop/queries.py:18 Order.notes|sqlalchemy|session.query(Order)',
      'lazy-relation-in-loop src/shop/queries.py:23 Customer.orders|sqlalchemy|select(Customer)',
      'lazy-relation-in-loop src/shop/queries.py:29 Order.customer|sqlalchemy|select(Order)',
      'lazy-relation-in-loop src/shop/queries.py:34 Customer.orders|sqlalchemy|select(Customer)',
    ]);
  });

  it('stays quiet for a loading option, a non-lazy relationship or an unknown origin', () => {
    expect(
      run(
        sqlalchemy(
          code(
            'from sqlalchemy.orm import joinedload, selectinload',
            '',
            '',
            'def a(session):',
            '    stmt = select(Order).options(selectinload(Order.customer))',
            '    return [o.customer for o in session.scalars(stmt)]',
            '',
            '',
            'def b(session):',
            '    return [o.customer for o in session.scalars(select(Order).options(joinedload(Order.customer)))]',
            '',
            '',
            'def c(session):',
            '    return [o.customer for o in session.query(Order).options(selectinload(Order.customer))]',
            '',
            '',
            'def d(session):',
            '    return [o.lines for o in session.scalars(select(Order))]',
            '',
            '',
            'def e(session, orders):',
            '    return [o.customer for o in orders]',
            '',
            '',
            'def f(session):',
            '    return [o.customer_id for o in session.scalars(select(Order))]',
            '',
            '',
            'def g(session):',
            '    return [row.id for row in session.execute(select(Order.id))]',
          ),
        ),
      ),
    ).toEqual([]);
  });
});

const SQLMODEL_MODELS = code(
  'from sqlmodel import Field, Relationship, SQLModel',
  '',
  '',
  'class Team(SQLModel, table=True):',
  '    id: int | None = Field(default=None, primary_key=True)',
  '    heroes: list["Hero"] = Relationship(back_populates="team")',
  '',
  '',
  'class Hero(SQLModel, table=True):',
  '    id: int | None = Field(default=None, primary_key=True)',
  '    team_id: int | None = Field(default=None, foreign_key="team.id")',
  '    team: Team | None = Relationship(back_populates="heroes")',
);

describe.skipIf(!enabled)('lazy-relation-in-loop over other loop and loader forms', () => {
  it('follows enumerate and a queryset variable refined in the loop', () => {
    expect(
      run(
        django(
          code(
            'from django.db.models import Prefetch',
            '',
            '',
            'def a():',
            '    for i, order in enumerate(Order.objects.all()):',
            '        print(i, order.customer.name)',
            '',
            '',
            'def b():',
            '    orders = Order.objects.filter(open=True)',
            '    return [o.customer.name for o in orders.order_by("id")]',
            '',
            '',
            'def c():',
            '    query = Order.objects.prefetch_related(Prefetch("lines", queryset=Item.objects.all()))',
            '    return [o.lines.all() for o in query]',
          ),
        ),
      ),
    ).toEqual([
      'lazy-relation-in-loop src/shop/views.py:9 Order.customer|django|Order.objects.all()',
      'lazy-relation-in-loop src/shop/views.py:14 Order.customer|django|Order.objects.filter(...).order_by()',
    ]);
  });

  it('reads every loader of a chained option and the other eager loaders', () => {
    expect(
      run(
        sqlalchemy(
          code(
            'from sqlalchemy.orm import defaultload, immediateload, selectinload, subqueryload',
            '',
            '',
            'def a(session):',
            '    stmt = select(Customer).options(selectinload(Customer.orders).selectinload(Order.notes))',
            '    return [c.orders for c in session.scalars(stmt)]',
            '',
            '',
            'def b(session):',
            '    stmt = select(Order).options(subqueryload(Order.notes), immediateload(Order.customer))',
            '    return [(o.notes, o.customer) for o in session.scalars(stmt)]',
            '',
            '',
            'def c(session):',
            '    stmt = select(Customer).options(defaultload(Customer.orders).selectinload(Order.notes))',
            '    return [c.orders for c in session.scalars(stmt)]',
          ),
        ),
      ),
    ).toEqual([
      'lazy-relation-in-loop src/shop/queries.py:21 Customer.orders|sqlalchemy|select(Customer)',
    ]);
  });

  it('reads a SQLModel exec of a select as the origin', () => {
    expect(
      run({
        'src/shop/models.py': SQLMODEL_MODELS,
        'src/shop/queries.py': code(
          'from sqlmodel import Session, select',
          '',
          'from shop.models import Hero',
          '',
          '',
          'def names(session: Session):',
          '    return [hero.team for hero in session.exec(select(Hero)).all()]',
        ),
      }),
    ).toEqual(['lazy-relation-in-loop src/shop/queries.py:7 Hero.team|sqlalchemy|select(Hero)']);
  });
});
