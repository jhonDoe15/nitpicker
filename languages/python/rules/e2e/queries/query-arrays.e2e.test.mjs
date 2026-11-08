import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const RULE = 'unbounded-query-array';
const SA =
  'import itertools\n\nfrom sqlalchemy import insert, select\nfrom sqlalchemy.orm import Session\n\nfrom shop.models import User\n\n\n';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [name, found.filter((f) => f.startsWith(RULE))]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('unbounded-query-array', () => {
  it('reports a runtime list in an in list or a multi-row insert', () => {
    const [actual, expected] = outcomes([
      [
        'in_ with a parameter, a comprehension and a field',
        `${SA}def by_ids(session: Session, ids: list[int]):\n    return session.scalars(select(User).where(User.id.in_(ids))).all()\n\n\ndef by_orders(session: Session, orders):\n    owners = [order.owner_id for order in orders]\n    return session.scalars(select(User).where(User.id.not_in(owners))).all()\n\n\ndef by_request(session: Session, request):\n    return session.scalars(select(User).where(User.id.in_(request.ids))).all()\n`,
        [`${RULE}:10 ids`, `${RULE}:15 owners`, `${RULE}:19 request.ids`],
      ],
      [
        'insert values with a list of rows',
        `${SA}def add(session: Session, rows: list[dict]):\n    session.execute(insert(User).values(rows))\n`,
        [`${RULE}:10 rows`],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('allows guarded, chunked, fixed and single values', () => {
    const [actual, expected] = outcomes([
      [
        'an empty check, a size check and chunks',
        `${SA}def by_ids(session: Session, ids: list[int]):\n    if not ids:\n        return []\n    return session.scalars(select(User).where(User.id.in_(ids))).all()\n\n\ndef capped(session: Session, ids: list[int]):\n    assert len(ids) <= 1000\n    return session.scalars(select(User).where(User.id.in_(ids))).all()\n\n\ndef chunked(session: Session, ids: list[int]):\n    for part in itertools.batched(ids, 1000):\n        session.execute(select(User).where(User.id.in_(part)))\n`,
        [],
      ],
      [
        'guards in other forms, a chunked comprehension and fixed comprehensions',
        `${SA}def a(session: Session, ids: list[int], org):\n    if not ids or not org:\n        return []\n    return session.scalars(select(User).where(User.id.in_(ids))).all()\n\n\ndef b(session: Session, ids: list[int]):\n    if ids == []:\n        return []\n    return session.scalars(select(User).where(User.id.in_(ids))).all()\n\n\ndef c(session: Session, o):\n    if not o.ids:\n        return []\n    return session.scalars(select(User).where(User.id.in_(o.ids))).all()\n\n\ndef d(session: Session, rows: list[User]):\n    for part in itertools.batched(rows, 100):\n        session.execute(insert(User).values([{"a": r.a} for r in part]))\n\n\ndef e(session: Session):\n    return session.scalars(select(User).where(User.status.in_([s.value for s in Status]))).all()\n`,
        [],
      ],
      [
        'a fixed list, a subquery, one row and executemany',
        `${SA}def fixed(session: Session):\n    return session.scalars(select(User).where(User.status.in_(["a", "b"]))).all()\n\n\ndef sub(session: Session):\n    owners = select(User.owner_id)\n    return session.scalars(select(User).where(User.id.in_(owners))).all()\n\n\ndef one(session: Session, row: dict):\n    session.execute(insert(User).values(row))\n\n\ndef many(session: Session, rows: list[dict]):\n    session.execute(insert(User), rows)\n`,
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
