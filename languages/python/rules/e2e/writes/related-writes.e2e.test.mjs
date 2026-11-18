import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['test-without-assertion'] });
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const DJANGO = ['from django.db import models, transaction', '', '', ''];

describe.skipIf(!enabled)('related-writes-without-transaction', () => {
  it('flags related writes that are not in one transaction', () => {
    const [actual, expected] = outcomes([
      [
        'two Django creates on different models',
        code(
          ...DJANGO,
          'def place(data):',
          '    order = Order.objects.create(**data)',
          '    Item.objects.create(order=order)',
        ),
        ['related-writes-without-transaction:7 place|Order.objects.create()|Item.objects.create()'],
      ],
      [
        'two Django saves of different instances',
        code(...DJANGO, 'def place(order, item):', '    order.save()', '    item.save()'),
        ['related-writes-without-transaction:7 place|order.save()|item.save()'],
      ],
      [
        'two SQLAlchemy writes committed one by one',
        code(
          'def place(session, order, item):',
          '    session.add(order)',
          '    session.commit()',
          '    session.add(item)',
          '    session.commit()',
        ),
        ['related-writes-without-transaction:4 place|session.add()|session.add()'],
      ],
      [
        'two SQLAlchemy sessions opened one after the other',
        code(
          'from sqlalchemy.orm import Session',
          '',
          '',
          'def place(engine, order, item):',
          '    with Session(engine) as first:',
          '        first.add(order)',
          '        first.commit()',
          '    with Session(engine) as second:',
          '        second.add(item)',
          '        second.commit()',
        ),
        ['related-writes-without-transaction:9 place|first.add()|second.add()'],
      ],
      [
        'two SQLAlchemy transaction blocks',
        code(
          'def place(session, order, item):',
          '    with session.begin():',
          '        session.add(order)',
          '    with session.begin():',
          '        session.add(item)',
        ),
        ['related-writes-without-transaction:5 place|session.add()|session.add()'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('leaves one transaction, one model and incidental writes alone', () => {
    const [actual, expected] = outcomes([
      [
        'an atomic block',
        code(
          ...DJANGO,
          'def place(data):',
          '    with transaction.atomic():',
          '        order = Order.objects.create(**data)',
          '        Item.objects.create(order=order)',
        ),
        [],
      ],
      [
        'an atomic decorator',
        code(
          ...DJANGO,
          '@transaction.atomic',
          'def place(data):',
          '    order = Order.objects.create(**data)',
          '    Item.objects.create(order=order)',
        ),
        [],
      ],
      [
        'one instance saved twice',
        code(...DJANGO, 'def rename(order):', '    order.save()', '    order.save()'),
        [],
      ],
      [
        'a view when the project makes every request atomic',
        {
          files: {
            'settings.py': code('DATABASES = {"default": {"ATOMIC_REQUESTS": True}}'),
            'views.py': code(
              ...DJANGO,
              'def place(request, data):',
              '    order = Order.objects.create(**data)',
              '    Item.objects.create(order=order)',
            ),
          },
        },
        [],
      ],
      [
        'a function whose writes are exclusive branches',
        code(
          ...DJANGO,
          'def place(order, item, flag):',
          '    if flag:',
          '        order.save()',
          '    else:',
          '        item.save()',
        ),
        [],
      ],
      [
        'an error record written in a handler',
        code(
          ...DJANGO,
          'def place(order, entry):',
          '    try:',
          '        order.save()',
          '    except ValueError:',
          '        entry.save()',
        ),
        [],
      ],
      [
        'a savepoint inside the outer transaction',
        code(
          'def place(db, order, item):',
          '    with db.begin_nested():',
          '        db.add(order)',
          '    db.add(item)',
          '    db.commit()',
        ),
        [],
      ],
      [
        'a session store save next to a model save',
        code(
          ...DJANGO,
          'def place(request, order):',
          '    order.save()',
          '    request.session.save()',
        ),
        [],
      ],
      [
        'several writes and one commit',
        code(
          'def place(session, order, item):',
          '    session.add(order)',
          '    session.add(item)',
          '    session.commit()',
        ),
        [],
      ],
      [
        'the same object committed twice',
        code(
          'def place(session, order):',
          '    session.add(order)',
          '    session.commit()',
          '    order.state = "done"',
          '    session.add(order)',
          '    session.commit()',
        ),
        [],
      ],
      [
        'a migration',
        {
          file: 'app/migrations/0002_fill.py',
          code: code(...DJANGO, 'def fill(order, item):', '    order.save()', '    item.save()'),
        },
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('write-outside-transaction', () => {
  it('flags a write through a session or alias that is not the block', () => {
    const [actual, expected] = outcomes([
      [
        'a session parameter next to the block session',
        code(
          'def place(session, audit_session, order, item):',
          '    with session.begin():',
          '        session.add(order)',
          '        audit_session.add(item)',
        ),
        ['write-outside-transaction:4 place|audit_session.add()|session.begin()'],
      ],
      [
        'a connection next to an engine transaction',
        code(
          'def place(engine, conn, statement):',
          '    with engine.begin() as inner:',
          '        inner.execute(statement)',
          '        conn.execute("INSERT INTO audit (id) VALUES (1)")',
        ),
        ['write-outside-transaction:4 place|conn.execute()|engine.begin()'],
      ],
      [
        'a Django write on another alias',
        code(
          ...DJANGO,
          'def place(data):',
          '    with transaction.atomic():',
          '        Order.objects.create(**data)',
          '        Entry.objects.using("audit").create(**data)',
        ),
        [
          'write-outside-transaction:8 place|Entry.objects.using(...).create()|transaction.atomic()',
        ],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('leaves writes through the block, local sessions and the same alias alone', () => {
    const [actual, expected] = outcomes([
      [
        'the block session',
        code(
          'def place(session, order, item):',
          '    with session.begin():',
          '        session.add(order)',
          '        session.add(item)',
        ),
        [],
      ],
      [
        'the connection the block hands out',
        code(
          'def place(engine, statement):',
          '    with engine.begin() as conn:',
          '        conn.execute(statement)',
        ),
        [],
      ],
      [
        'a repository attribute whose session is not known',
        code(
          'class Service:',
          '    def __init__(self, session, other):',
          '        self.session = session',
          '        self.other = other',
          '',
          '    def place(self, order, item):',
          '        with self.session.begin():',
          '            self.session.add(order)',
          '            self.other.add(item)',
        ),
        [],
      ],
      [
        'a session opened inside the block on purpose',
        code(
          'from sqlalchemy.orm import Session',
          '',
          '',
          'def place(session, engine, order, entry):',
          '    with session.begin():',
          '        session.add(order)',
          '        with Session(engine) as audit:',
          '            audit.add(entry)',
        ),
        [],
      ],
      [
        'the same Django alias',
        code(
          ...DJANGO,
          'def place(data):',
          '    with transaction.atomic(using="audit"):',
          '        Entry.objects.using("audit").create(**data)',
          '        Entry.objects.create(**data)',
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
