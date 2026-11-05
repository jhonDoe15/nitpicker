import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const ORM_RULES = ['eager-relationship', 'many-to-many-cascade-delete'];
const ORM = 'from sqlalchemy.orm import backref, relationship\n';
const inFile = (file, code) => ({ file, code });

function ormOutcomes(rows) {
  const [actual, expected] = outcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [
      name,
      found.filter((item) => ORM_RULES.some((rule) => item.startsWith(`${rule}:`))),
    ]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('eager-relationship', () => {
  it('flags eager loader strategies on the mapping and leaves lazy ones alone', () => {
    const [actual, expected] = ormOutcomes([
      [
        'joined, subquery, selectin and immediate',
        `${ORM}\n\nclass Order:\n    a = relationship("A", lazy="joined")\n    b = relationship("B", lazy="subquery")\n    c = relationship("C", lazy="selectin")\n    d = relationship("D", lazy="immediate")\n`,
        [
          'eager-relationship:5 Order.a',
          'eager-relationship:6 Order.b',
          'eager-relationship:7 Order.c',
          'eager-relationship:8 Order.d',
        ],
      ],
      [
        'the legacy lazy=False',
        `${ORM}\n\nclass Order:\n    lines = relationship("Line", lazy=False)\n`,
        ['eager-relationship:5 Order.lines'],
      ],
      [
        'lazy strategies',
        `${ORM}\n\nclass Order:\n    a = relationship("A")\n    b = relationship("B", lazy="select")\n    c = relationship("C", lazy="raise")\n    d = relationship("D", lazy="write_only")\n    e = relationship("E", lazy="dynamic")\n    f = relationship("F", lazy=True)\n    g = relationship("G", lazy="noload")\n`,
        [],
      ],
      [
        'an annotated mapping through a module alias',
        'import sqlalchemy.orm as orm\nfrom sqlalchemy.orm import Mapped\n\n\nclass Order:\n    customer: Mapped["Customer"] = orm.relationship(lazy="selectin")\n',
        ['eager-relationship:6 Order.customer'],
      ],
      [
        'an eager backref',
        `${ORM}\n\nclass Order:\n    lines = relationship("Line", backref=backref("order", lazy="joined"))\n`,
        ['eager-relationship:5 Order backref order'],
      ],
      [
        'Flask-SQLAlchemy db.relationship',
        'from app.extensions import db\n\n\nclass Order(db.Model):\n    lines = db.relationship("Line", lazy="joined")\n',
        ['eager-relationship:5 Order.lines'],
      ],
      [
        'SQLModel sa_relationship_kwargs',
        'from sqlmodel import Relationship, SQLModel\n\n\nclass Team(SQLModel, table=True):\n    heroes: list["Hero"] = Relationship(sa_relationship_kwargs={"lazy": "selectin"})\n',
        ['eager-relationship:5 Team.heroes'],
      ],
      [
        'keyword options unpacked from a dict literal',
        `${ORM}\n\nclass Order:\n    lines = relationship("Line", **{"lazy": "joined"})\n`,
        ['eager-relationship:5 Order.lines'],
      ],
      [
        'a local function named relationship',
        'def relationship(name, lazy):\n    return name\n\n\nclass Order:\n    lines = relationship("Line", lazy="joined")\n',
        [],
      ],
      [
        'per-query loader options',
        'from sqlalchemy import select\nfrom sqlalchemy.orm import joinedload, selectinload\n\n\ndef load(Order):\n    return select(Order).options(selectinload(Order.lines), joinedload(Order.customer))\n',
        [],
      ],
      [
        'an imperative mapping and a declared_attr',
        'from sqlalchemy.orm import declared_attr, registry, relationship\n\nreg = registry()\nmapper = reg.map_imperatively(Order, t, properties={"lines": relationship(Line, lazy="joined")})\n\n\nclass Mixin:\n    @declared_attr\n    def owner(cls):\n        return relationship("User", lazy="selectin")\n',
        ['eager-relationship:4 lines', 'eager-relationship:10 Mixin.owner'],
      ],
      [
        'SQLModel options built with dict()',
        'from sqlmodel import Relationship, SQLModel\n\n\nclass Team(SQLModel, table=True):\n    heroes: list["Hero"] = Relationship(sa_relationship_kwargs=dict(lazy="selectin"))\n',
        ['eager-relationship:5 Team.heroes'],
      ],
      [
        'a relationship method of an unrelated object',
        'class Graph:\n    def link(self, graph):\n        return graph.relationship("Line", lazy="joined")\n',
        [],
      ],
      [
        'test code',
        inFile(
          'tests/test_models.py',
          `${ORM}\n\nclass Order:\n    lines = relationship("Line", lazy="joined")\n`,
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('many-to-many-cascade-delete', () => {
  it('flags deleting cascades on secondary relationships only', () => {
    const [actual, expected] = ormOutcomes([
      [
        'all, delete and delete-orphan on a secondary relationship',
        `${ORM}\n\nclass Product:\n    a = relationship("Tag", secondary="product_tags", cascade="all")\n    b = relationship("Tag", secondary="product_tags", cascade="save-update, delete")\n    c = relationship("Tag", secondary="product_tags", cascade="all,delete-orphan")\n`,
        [
          'many-to-many-cascade-delete:5 Product.a',
          'many-to-many-cascade-delete:6 Product.b',
          'many-to-many-cascade-delete:7 Product.c',
        ],
      ],
      [
        'persist-only cascades on a secondary relationship',
        `${ORM}\n\nclass Product:\n    tags = relationship("Tag", secondary="product_tags", cascade="save-update, merge")\n    labels = relationship("Label", secondary="product_labels")\n`,
        [],
      ],
      [
        'a one-to-many or association-object cascade',
        `${ORM}\n\nclass Product:\n    lines = relationship("Line", cascade="all, delete-orphan")\n`,
        [],
      ],
      [
        'single_parent makes the cascade safe',
        `${ORM}\n\nclass Product:\n    tags = relationship("Tag", secondary="t", cascade="all, delete-orphan", single_parent=True)\n`,
        [],
      ],
      [
        'the backref of a secondary relationship',
        `${ORM}\n\nclass Product:\n    tags = relationship("Tag", secondary="t", backref=backref("products", cascade="all"))\n`,
        ['many-to-many-cascade-delete:5 Product backref products'],
      ],
      [
        'SQLModel link_model with cascade_delete or sa_relationship_kwargs',
        'from sqlmodel import Relationship, SQLModel\n\n\nclass Team(SQLModel, table=True):\n    a: list["Hero"] = Relationship(link_model=HeroTeam, cascade_delete=True)\n    b: list["Hero"] = Relationship(link_model=HeroTeam, sa_relationship_kwargs={"cascade": "all, delete"})\n    c: list["Hero"] = Relationship(cascade_delete=True)\n',
        ['many-to-many-cascade-delete:5 Team.a', 'many-to-many-cascade-delete:6 Team.b'],
      ],
      [
        'secondary given positionally or only in sa_relationship_kwargs',
        `${ORM}from sqlmodel import Relationship\n\n\nclass Product:\n    a = relationship("Tag", "product_tags", cascade="all")\n    b: list["Tag"] = Relationship(sa_relationship_kwargs={"secondary": "t", "cascade": "delete"})\n`,
        ['many-to-many-cascade-delete:6 Product.a', 'many-to-many-cascade-delete:7 Product.b'],
      ],
      [
        'secondary=None and viewonly relationships',
        `${ORM}\n\nclass Product:\n    a = relationship("Tag", secondary=None, cascade="all")\n    b = relationship("Tag", secondary="t", viewonly=True, cascade="all")\n`,
        [],
      ],
      [
        'Flask-SQLAlchemy db.relationship',
        'from app.extensions import db\n\n\nclass Post(db.Model):\n    tags = db.relationship("Tag", secondary=post_tags, cascade="all, delete")\n',
        ['many-to-many-cascade-delete:5 Post.tags'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
