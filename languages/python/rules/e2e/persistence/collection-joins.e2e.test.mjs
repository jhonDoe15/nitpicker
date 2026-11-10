import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const RULE = 'multiple-collection-joins';
const MODELS = [
  'from sqlalchemy import Column, ForeignKey, Integer, Table, select',
  'from sqlalchemy.orm import DeclarativeBase, Mapped, Session, contains_eager, joinedload, mapped_column',
  'from sqlalchemy.orm import relationship, selectinload',
  '',
  '',
  'class Base(DeclarativeBase):',
  '    pass',
  '',
  '',
  'tags = Table("order_tags", Base.metadata, Column("order_id", ForeignKey("orders.id")))',
  '',
  '',
  'class Customer(Base):',
  '    __tablename__ = "customers"',
  '    id = Column(Integer, primary_key=True)',
  '',
  '',
  'class Order(Base):',
  '    __tablename__ = "orders"',
  '    id = Column(Integer, primary_key=True)',
  '    customer_id = Column(ForeignKey("customers.id"))',
  '    customer = relationship("Customer")',
  '    lines = relationship("Line", back_populates="order")',
  '    payments: Mapped[list["Payment"]] = relationship()',
  '    labels = relationship("Label", secondary=tags)',
  '    notes = relationship("Note", uselist=True)',
  '',
  '',
  'class Line(Base):',
  '    __tablename__ = "lines"',
  '    id = Column(Integer, primary_key=True)',
  '    order_id = Column(ForeignKey("orders.id"))',
  '    order = relationship("Order", back_populates="lines")',
  '    parts: Mapped[list["Part"]] = relationship()',
  '    taxes: Mapped[set["Tax"]] = relationship()',
  '    product: Mapped["Product | None"] = relationship()',
  '',
  '',
].join('\n');

function query(body) {
  return `${MODELS}\ndef run(session: Session):\n    return ${body}\n`;
}

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

const LINE = 40;

describe.skipIf(!enabled)('multiple-collection-joins', () => {
  it('reports two collections joined into one query and leaves the allowed forms alone', () => {
    const [actual, expected] = ruleOutcomes([
      [
        'one collection next to a to-one relation',
        query('select(Order).options(joinedload(Order.lines), joinedload(Order.customer))'),
        [],
      ],
      [
        'a collection of a collection along one path',
        query('select(Order).options(joinedload(Order.lines).joinedload(Line.parts))'),
        [],
      ],
      [
        'collections loaded with selectinload',
        query('select(Order).options(selectinload(Order.lines), selectinload(Order.payments))'),
        [],
      ],
      [
        'one collection joined and one selected in',
        query('select(Order).options(selectinload(Order.lines), joinedload(Order.payments))'),
        [],
      ],
      [
        'a to-one relation inside a joined collection',
        query('select(Order).options(joinedload(Order.lines).joinedload(Line.product))'),
        [],
      ],
      [
        'two joined collections',
        query('select(Order).options(joinedload(Order.lines), joinedload(Order.payments))'),
        [`${RULE}:${String(LINE)} Order.lines Order.payments`],
      ],
      [
        'joined collections across chained options calls',
        query(
          'session.query(Order).options(joinedload(Order.lines)).options(joinedload(Order.labels))',
        ),
        [`${RULE}:${String(LINE)} Order.lines Order.labels`],
      ],
      [
        'a uselist relationship and contains_eager',
        query(
          'select(Order).join(Order.notes).options(contains_eager(Order.notes), joinedload(Order.payments))',
        ),
        [`${RULE}:${String(LINE)} Order.notes Order.payments`],
      ],
      [
        'two collections under one joined collection',
        query(
          'select(Order).options(joinedload(Order.lines).joinedload(Line.parts), joinedload(Order.lines).joinedload(Line.taxes))',
        ),
        [`${RULE}:${String(LINE)} Order.lines.parts Order.lines.taxes`],
      ],
      [
        'two collections joined into the query of a selected-in collection',
        query(
          'select(Order).options(selectinload(Order.lines).joinedload(Line.parts), selectinload(Order.lines).joinedload(Line.taxes))',
        ),
        [`${RULE}:${String(LINE)} Order.lines.parts Order.lines.taxes`],
      ],
      [
        'the legacy string paths of a query',
        query('session.query(Order).options(joinedload("lines"), joinedload("payments")).all()'),
        [`${RULE}:${String(LINE)} Order.lines Order.payments`],
      ],
      [
        'the options of Session.get',
        query('session.get(Order, 1, options=[joinedload(Order.lines), joinedload(Order.labels)])'),
        [`${RULE}:${String(LINE)} Order.lines Order.labels`],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('resolves models of other modules, SQLModel and Flask-SQLAlchemy', () => {
    const [actual, expected] = ruleOutcomes([
      [
        'a model imported from another module',
        {
          files: {
            'shop/__init__.py': '',
            'shop/models.py': MODELS,
            'shop/orders.py':
              'from sqlalchemy import select\nfrom sqlalchemy.orm import joinedload\n\nfrom shop.models import Order\n\nQUERY = select(Order).options(joinedload(Order.lines), joinedload(Order.payments))\n',
          },
        },
        [`${RULE}:6 Order.lines Order.payments`],
      ],
      [
        'SQLModel list relationships',
        'from sqlmodel import Field, Relationship, SQLModel, select\nfrom sqlalchemy.orm import joinedload\n\n\nclass Team(SQLModel, table=True):\n    id: int = Field(primary_key=True)\n    heroes: list["Hero"] = Relationship(back_populates="team")\n    sponsors: list["Sponsor"] = Relationship()\n    owner: "Owner" = Relationship()\n\n\nQUERY = select(Team).options(joinedload(Team.heroes), joinedload(Team.sponsors))\nOK = select(Team).options(joinedload(Team.heroes), joinedload(Team.owner))\n',
        ['multiple-collection-joins:12 Team.heroes Team.sponsors'],
      ],
      [
        'Flask-SQLAlchemy relationships found by their foreign keys',
        'from app.extensions import db\n\n\nclass Order(db.Model):\n    id = db.Column(db.Integer, primary_key=True)\n    lines = db.relationship("Line", backref="order")\n    refunds = db.relationship("Refund")\n\n\nclass Line(db.Model):\n    id = db.Column(db.Integer, primary_key=True)\n    order_id = db.Column(db.ForeignKey("order.id"))\n\n\nclass Refund(db.Model):\n    id = db.Column(db.Integer, primary_key=True)\n    order_id = db.Column(db.Integer, db.ForeignKey("order.id"))\n\n\ndef run():\n    return Order.query.options(db.joinedload(Order.lines), db.joinedload(Order.refunds)).all()\n',
        ['multiple-collection-joins:21 Order.lines Order.refunds'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
  it('follows aliases, held loaders and statements, roots that share names and other annotations', () => {
    const [actual, expected] = ruleOutcomes([
      [
        'a loader imported under another name',
        `${MODELS}\nfrom sqlalchemy.orm import joinedload as jl\n\nQUERY = select(Order).options(jl(Order.lines), jl(Order.payments))\n`,
        [`${RULE}:41 Order.lines Order.payments`],
      ],
      [
        'loaders held in variables',
        `${MODELS}\ndef run(session: Session):\n    lines = joinedload(Order.lines)\n    payments = joinedload(Order.payments)\n    return select(Order).options(lines, payments)\n`,
        [`${RULE}:41 Order.lines Order.payments`],
      ],
      [
        'a statement extended after it was assigned',
        `${MODELS}\ndef run(session: Session):\n    statement = select(Order).options(joinedload(Order.lines))\n    statement = statement.options(joinedload(Order.payments))\n    return statement\n`,
        [`${RULE}:41 Order.lines Order.payments`],
      ],
      [
        'two roots whose collections share a name',
        `${MODELS}\nclass Invoice(Base):\n    __tablename__ = "invoices"\n    id = Column(Integer, primary_key=True)\n    lines: Mapped[list["Line"]] = relationship()\n\n\nQUERY = select(Order, Invoice).options(joinedload(Order.lines), joinedload(Invoice.lines))\n`,
        [`${RULE}:45 Order.lines Invoice.lines`],
      ],
      [
        'a Union annotation and a db object that is not Flask-SQLAlchemy',
        'from typing import Union\n\nfrom sqlalchemy import ForeignKey, select\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship\n\n\nclass Base(DeclarativeBase):\n    pass\n\n\nclass Shop(Base):\n    __tablename__ = "shops"\n    id: Mapped[int] = mapped_column(primary_key=True)\n    staff: Mapped[Union[list["Clerk"], None]] = relationship()\n    shelves: Mapped[list["Clerk"]] = relationship()\n\n\nclass Clerk(Base):\n    __tablename__ = "clerks"\n    id: Mapped[int] = mapped_column(primary_key=True)\n    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"))\n\n\nclass Thing:\n    def joinedload(self, attribute):\n        return attribute\n\n\ndb = Thing()\nUNION = select(Shop).options(db.joinedload(Shop.staff), db.joinedload(Shop.shelves))\n',
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
