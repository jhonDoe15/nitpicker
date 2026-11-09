import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const RULE = 'unindexed-foreign-key';
const ALCHEMY = [
  'from sqlalchemy import Column, ForeignKey, ForeignKeyConstraint, Index, Integer, Table',
  'from sqlalchemy import UniqueConstraint',
  'from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column',
  '',
  '',
  'class Base(DeclarativeBase):',
  '    pass',
  '',
  '',
].join('\n');
const DJANGO = 'from django.db import models\n\n\n';

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

function alchemy(body) {
  return { files: { 'shop/models.py': `${ALCHEMY}${body}` } };
}

describe.skipIf(!enabled)('unindexed-foreign-key on SQLAlchemy models', () => {
  it('reports a foreign key column with no index that starts with it', () => {
    const [actual, expected] = ruleOutcomes([
      [
        'a mapped_column with a ForeignKey',
        alchemy(
          'class Order(Base):\n    __tablename__ = "orders"\n    id: Mapped[int] = mapped_column(primary_key=True)\n    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))\n',
        ),
        ['unindexed-foreign-key:12 Order.customer_id'],
      ],
      [
        'an index that has the column second',
        alchemy(
          'class Order(Base):\n    __tablename__ = "orders"\n    __table_args__ = (Index("ix_orders", "created", "customer_id"),)\n    id = Column(Integer, primary_key=True)\n    customer_id = Column(Integer, ForeignKey("customers.id"))\n',
        ),
        ['unindexed-foreign-key:13 Order.customer_id'],
      ],
      [
        'a partial index',
        alchemy(
          'class Order(Base):\n    __tablename__ = "orders"\n    id = Column(Integer, primary_key=True)\n    customer_id = Column(Integer, ForeignKey("customers.id"))\n    __table_args__ = (Index("ix", "customer_id", postgresql_where="archived"),)\n',
        ),
        ['unindexed-foreign-key:12 Order.customer_id'],
      ],
      [
        'the second column of a composite primary key',
        alchemy(
          'class Line(Base):\n    __tablename__ = "lines"\n    order_id = Column(Integer, ForeignKey("orders.id"), primary_key=True)\n    product_id = Column(Integer, ForeignKey("products.id"), primary_key=True)\n',
        ),
        ['unindexed-foreign-key:12 Line.product_id'],
      ],
      [
        'a composite ForeignKeyConstraint and a core Table',
        alchemy(
          'class Line(Base):\n    __tablename__ = "lines"\n    id = Column(Integer, primary_key=True)\n    order_id = Column(Integer)\n    shop_id = Column(Integer)\n    __table_args__ = (ForeignKeyConstraint(["order_id", "shop_id"], ["orders.id", "orders.shop_id"]),)\n\n\nnotes = Table("notes", Base.metadata, Column("id", Integer, primary_key=True), Column("order_id", ForeignKey("orders.id")))\n',
        ),
        [
          'unindexed-foreign-key:14 Line.order_id, shop_id',
          'unindexed-foreign-key:17 notes.order_id',
        ],
      ],
      [
        'a SQLModel field',
        {
          files: {
            'shop/models.py':
              'from sqlmodel import Field, SQLModel\n\n\nclass Order(SQLModel, table=True):\n    id: int = Field(primary_key=True)\n    customer_id: int = Field(foreign_key="customer.id")\n',
          },
        },
        ['unindexed-foreign-key:6 Order.customer_id'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('accepts index=True, unique, a leading primary key and indexes that start with the column', () => {
    const [actual, expected] = ruleOutcomes([
      [
        'index=True',
        alchemy(
          'class Order(Base):\n    __tablename__ = "orders"\n    id: Mapped[int] = mapped_column(primary_key=True)\n    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)\n',
        ),
        [],
      ],
      [
        'a table-args index and a unique constraint',
        alchemy(
          'class Order(Base):\n    __tablename__ = "orders"\n    id = Column(Integer, primary_key=True)\n    customer_id = Column(Integer, ForeignKey("customers.id"))\n    shop_id = Column(Integer, ForeignKey("shops.id"))\n    __table_args__ = (Index("ix", "customer_id", "id"), UniqueConstraint("shop_id", "id"))\n',
        ),
        [],
      ],
      [
        'a module-level index on the attribute',
        alchemy(
          'class Order(Base):\n    __tablename__ = "orders"\n    id = Column(Integer, primary_key=True)\n    customer_id = Column(Integer, ForeignKey("customers.id"))\n\n\nIndex("ix_orders_customer", Order.customer_id)\n',
        ),
        [],
      ],
      [
        'the first column of a composite primary key',
        alchemy(
          'class Line(Base):\n    __tablename__ = "lines"\n    order_id = Column(Integer, ForeignKey("orders.id"), primary_key=True)\n    position = Column(Integer, primary_key=True)\n',
        ),
        [],
      ],
      [
        'a pydantic Field and a plain class',
        {
          files: {
            'shop/forms.py':
              'from pydantic import BaseModel, Field\n\n\nclass Order(BaseModel):\n    customer_id: int = Field(foreign_key="customer.id")\n',
          },
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves models to Alembic when the project has its migrations', () => {
    const [actual, expected] = ruleOutcomes([
      [
        'an Alembic project',
        {
          files: {
            'alembic/env.py': 'config = None\n',
            'alembic/versions/0001_init.py': 'revision = "0001"\n',
            'shop/models.py': `${ALCHEMY}class Order(Base):\n    __tablename__ = "orders"\n    id = Column(Integer, primary_key=True)\n    customer_id = Column(Integer, ForeignKey("customers.id"))\n`,
          },
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('unindexed-foreign-key on Django models', () => {
  it('reports db_index=False unless Meta indexes the field first', () => {
    const [actual, expected] = ruleOutcomes([
      [
        'db_index=False',
        {
          files: {
            'shop/models.py': `${DJANGO}class Order(models.Model):\n    customer = models.ForeignKey("Customer", on_delete=models.CASCADE, db_index=False)\n    shop = models.ForeignKey("Shop", on_delete=models.CASCADE)\n`,
          },
        },
        ['unindexed-foreign-key:5 Order.customer'],
      ],
      [
        'a conditional index and an index with the field second',
        {
          files: {
            'shop/models.py': `${DJANGO}class Order(models.Model):\n    customer = models.ForeignKey("Customer", on_delete=models.CASCADE, db_index=False)\n\n    class Meta:\n        indexes = [\n            models.Index(fields=["customer"], condition=models.Q(open=True), name="open"),\n            models.Index(fields=["created", "customer"], name="by_created"),\n        ]\n`,
          },
        },
        ['unindexed-foreign-key:5 Order.customer'],
      ],
      [
        'covered by Meta indexes, unique_together and a UniqueConstraint',
        {
          files: {
            'shop/models.py': `${DJANGO}class Order(models.Model):\n    customer = models.ForeignKey("Customer", on_delete=models.CASCADE, db_index=False)\n    shop = models.ForeignKey("Shop", on_delete=models.CASCADE, db_index=False)\n    courier = models.ForeignKey("Courier", on_delete=models.CASCADE, db_index=False)\n    store = models.ForeignKey("Store", on_delete=models.CASCADE, db_index=False, db_constraint=False)\n\n    class Meta:\n        indexes = [models.Index(fields=["customer", "-created"], name="by_customer")]\n        unique_together = [("shop_id", "number")]\n        constraints = [models.UniqueConstraint(fields=["courier", "number"], name="one")]\n`,
          },
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('leaves MySQL projects alone', () => {
    const [actual, expected] = ruleOutcomes([
      [
        'a MySQL settings module',
        {
          files: {
            'shop/settings.py': 'DATABASES = {"default": {"ENGINE": "django.db.backends.mysql"}}\n',
            'shop/models.py': `${DJANGO}class Order(models.Model):\n    customer = models.ForeignKey("Customer", on_delete=models.CASCADE, db_index=False)\n`,
          },
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
