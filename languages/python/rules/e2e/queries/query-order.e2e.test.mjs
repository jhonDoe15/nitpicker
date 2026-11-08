import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { sqlOrderGaps } from '../../../../../shared/rules/queries/sql-order.mjs';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const RULE = 'unordered-query';
const RULES_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CASES = JSON.parse(
  readFileSync(new URL('../../../../../shared/rules/queries/test-support/sql-order-cases.json', import.meta.url), 'utf8'),
);
const PORT = [
  'import json, sys',
  'sys.path.insert(0, sys.argv[1])',
  'from queries.sql_order import sql_order_gaps',
  'texts = json.load(sys.stdin)',
  'print(json.dumps([[f"{kind}:{form}" for _, kind, form in sql_order_gaps(text)] for text in texts]))',
].join('\n');
const SA = 'from sqlalchemy import func, select\nfrom sqlalchemy.orm import Session\n\nfrom shop.models import User\n\n\n';
const MODELS = 'from django.db import models\n\n\nclass Order(models.Model):\n    total = models.IntegerField()\n\n\nclass Invoice(models.Model):\n    total = models.IntegerField()\n\n    class Meta:\n        ordering = ["id"]\n';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [name, found.filter((f) => f.startsWith(RULE))]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('unordered-query', () => {
  it('reads SQL text the way the shared analyzer does', () => {
    const texts = [...CASES.reports.map(([text]) => text), ...CASES.allows];
    const result = spawnSync('python3', ['-I', '-c', PORT, RULES_ROOT], { input: JSON.stringify(texts), encoding: 'utf8' });
    const expected = texts.map((text) => sqlOrderGaps(text).map(({ kind, form }) => `${kind}:${form}`));
    expect(JSON.parse(result.stdout)).toEqual(expected);
  });

  it('reports SQL text and SQLAlchemy pages with no ORDER BY', () => {
    const [actual, expected] = outcomes([
      [
        'SQL text with LIMIT, an f-string and an unordered array_agg',
        'RECENT = "select id from account where active limit 20"\n\n\ndef page(size):\n    return f"select id from account where org = 1 limit {size}"\n\n\nTAGS = "select a.id, array_agg(t.name) from a join t on t.a = a.id"\n',
        [`${RULE}:1 LIMIT 20`, `${RULE}:5 LIMIT ?`, `${RULE}:8 array_agg(...)`],
      ],
      [
        'select chains, a held statement and Session.query',
        `${SA}def recent(session: Session):\n    return session.scalars(select(User).where(User.active).limit(20)).all()\n\n\ndef paged(session: Session, page: int):\n    stmt = select(User)\n    stmt = stmt.where(User.active)\n    return session.scalars(stmt.offset(page * 20).limit(20)).all()\n\n\ndef legacy(session: Session):\n    return session.query(User).filter(User.active).limit(10).all()\n`,
        [`${RULE}:8 .limit(20)`, `${RULE}:14 .offset(page * 20)`, `${RULE}:18 .limit(10)`],
      ],
      [
        'func.array_agg without aggregate_order_by',
        `${SA}def names(session: Session):\n    return session.execute(select(User.org_id, func.array_agg(User.name)).group_by(User.org_id)).all()\n`,
        [`${RULE}:8 array_agg(...)`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('allows ordered pages, existence checks and builders it cannot follow', () => {
    const [actual, expected] = outcomes([
      [
        'ordered SQL text and a constant LIMIT 1',
        'RECENT = "select id from account order by created_at desc, id limit 20"\nTAKEN = "select 1 from account where name = %s limit 1"\nNOTE = "Shows at most 20 rows; raise the limit in settings."\n',
        [],
      ],
      [
        'ordered chains, an order added later, a count and a sort helper',
        `${SA}def recent(session: Session):\n    return session.scalars(select(User).order_by(User.created.desc(), User.id).limit(20)).all()\n\n\ndef later(session: Session, page: int):\n    stmt = select(User).limit(20)\n    stmt = stmt.order_by(User.id)\n    return session.scalars(stmt).all()\n\n\ndef taken(session: Session):\n    return session.scalar(select(func.count()).select_from(User).limit(1))\n\n\ndef sorted_page(session: Session, sort):\n    stmt = sort(select(User))\n    return session.scalars(stmt.limit(20)).all()\n`,
        [],
      ],
      [
        'array_agg with aggregate_order_by',
        `from sqlalchemy.dialects.postgresql import aggregate_order_by\n${SA}def names(session: Session):\n    return session.execute(select(func.array_agg(aggregate_order_by(User.name, User.name)))).all()\n`,
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reports a Django queryset slice only for a model with no default ordering', () => {
    const [actual, expected] = outcomes([
      [
        'slices of an unordered and an ordered model',
        {
          files: {
            'shop/models.py': MODELS,
            'shop/views.py': 'from shop.models import Invoice, Order\n\n\ndef recent():\n    return list(Order.objects.filter(total__gt=0)[:20])\n\n\ndef ordered():\n    return list(Order.objects.order_by("-total", "id")[:20])\n\n\ndef invoices():\n    return list(Invoice.objects.all()[:20])\n\n\ndef held():\n    orders = Order.objects.filter(total__gt=0)\n    return list(orders[20:40])\n',
          },
        },
        [`${RULE}:5 [:20]`, `${RULE}:18 [20:40]`],
      ],
      [
        'ArrayAgg with and without an order',
        'from django.contrib.postgres.aggregates import ArrayAgg\n\n\ndef tags(queryset):\n    return queryset.annotate(names=ArrayAgg("tags__name")), queryset.annotate(names=ArrayAgg("tags__name", order_by="tags__name"))\n',
        [`${RULE}:5 ArrayAgg(...)`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
