import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: ['io-in-loop', 'swallowed-exception', 'test-without-assertion'],
});
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const HEAD = code(
  'import backoff',
  'from sqlalchemy.orm import exc',
  'from sqlalchemy.orm.exc import StaleDataError',
  'from tenacity import Retrying, retry, retry_if_exception_type',
  '',
  'from shop.models import Order',
  '',
  '',
);
const script = (body, file = 'shop/orders.py') => ({ files: { [file]: `${HEAD}${body}` } });

const LOOP_BODY = ['        try:', '            session.commit()', '            return'];
const loop = (handler, header = '    for _ in range(3):') =>
  script(
    code(
      'def ship(session, order):',
      '    order.status = "shipped"',
      header,
      ...LOOP_BODY,
      ...handler,
    ),
  );

describe.skipIf(!enabled)('stale-retry', () => {
  it('reports a commit retried after StaleDataError without reading the row again', () => {
    const [actual, expected] = outcomes([
      [
        'a for loop',
        loop(['        except StaleDataError:', '            session.rollback()']),
        ['stale-retry:13 session.commit()|retry loop'],
      ],
      [
        'a while loop and the module path',
        loop(
          ['        except exc.StaleDataError:', '            session.rollback()'],
          '    while True:',
        ),
        ['stale-retry:13 session.commit()|retry loop'],
      ],
      [
        'a tuple of exceptions',
        loop(['        except (StaleDataError, ValueError):', '            pass']),
        ['stale-retry:13 session.commit()|retry loop'],
      ],
      [
        'a tenacity decorator',
        script(
          code(
            '@retry(retry=retry_if_exception_type(StaleDataError))',
            'def ship(session, order):',
            '    order.status = "shipped"',
            '    session.commit()',
          ),
        ),
        ['stale-retry:12 session.commit()|@retry'],
      ],
      [
        'a backoff decorator',
        script(
          code(
            '@backoff.on_exception(backoff.expo, StaleDataError, max_tries=3)',
            'def ship(session, order):',
            '    order.status = "shipped"',
            '    session.commit()',
          ),
        ),
        ['stale-retry:12 session.commit()|@on_exception'],
      ],
      [
        'a tenacity attempt loop',
        script(
          code(
            'def ship(session, order):',
            '    for attempt in Retrying(retry=retry_if_exception_type(StaleDataError)):',
            '        with attempt:',
            '            order.status = "shipped"',
            '            session.commit()',
          ),
        ),
        ['stale-retry:13 session.commit()|Retrying'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('stays quiet when the attempt reads the row again or the retry is not about a stale row', () => {
    const [actual, expected] = outcomes([
      [
        'a get inside the attempt',
        script(
          code(
            'def ship(session, order_id):',
            '    for _ in range(3):',
            '        try:',
            '            order = session.get(Order, order_id)',
            '            order.status = "shipped"',
            '            session.commit()',
            '            return',
            '        except StaleDataError:',
            '            session.rollback()',
          ),
        ),
        [],
      ],
      [
        'a refresh in the handler',
        loop(['        except StaleDataError:', '            session.refresh(order)']),
        [],
      ],
      [
        'a project helper that reloads',
        script(
          code(
            'def reload(session, order):',
            '    return session.execute(order.select()).scalar_one()',
            '',
            '',
            'def ship(session, order):',
            '    for _ in range(3):',
            '        try:',
            '            order = reload(session, order)',
            '            session.commit()',
            '            return',
            '        except StaleDataError:',
            '            session.rollback()',
          ),
        ),
        [],
      ],
      [
        'a unit of work read through its repository',
        script(
          code(
            'def ship(uow, order_id):',
            '    for _ in range(3):',
            '        try:',
            '            with uow:',
            '                order = uow.orders.load(order_id)',
            '                uow.commit()',
            '            return',
            '        except StaleDataError:',
            '            uow.rollback()',
          ),
        ),
        [],
      ],
      [
        'a session opened inside the attempt',
        script(
          code(
            'def ship(order_id):',
            '    for _ in range(3):',
            '        try:',
            '            session = SessionLocal()',
            '            session.commit()',
            '            return',
            '        except StaleDataError:',
            '            session.rollback()',
          ),
        ),
        [],
      ],
      [
        'a helper that receives the session',
        script(
          code(
            'def ship(session, order_id):',
            '    for _ in range(3):',
            '        try:',
            '            apply_change(session, order_id)',
            '            session.commit()',
            '            return',
            '        except StaleDataError:',
            '            session.rollback()',
          ),
        ),
        [],
      ],
      ['a handler that raises', loop(['        except StaleDataError:', '            raise']), []],
      [
        'another exception',
        loop(['        except ValueError:', '            session.rollback()']),
        [],
      ],
      [
        'a tenacity decorator that re-reads in the body',
        script(
          code(
            '@retry(retry=retry_if_exception_type(StaleDataError))',
            'def ship(session, order_id):',
            '    order = session.get(Order, order_id)',
            '    order.status = "shipped"',
            '    session.commit()',
          ),
        ),
        [],
      ],
      [
        'a tenacity decorator that does not name the stale error',
        script(code('@retry', 'def ship(session, order):', '    session.commit()')),
        [],
      ],
      [
        'a file without SQLAlchemy',
        {
          files: {
            'shop/orders.py': code(
              'from lib import StaleDataError',
              '',
              '',
              'def ship(db):',
              '    for _ in range(3):',
              '        try:',
              '            db.commit()',
              '            return',
              '        except StaleDataError:',
              '            pass',
            ),
          },
        },
        [],
      ],
      [
        'a test file',
        script(
          code(
            'def test_ship(session, order):',
            '    for _ in range(3):',
            '        try:',
            '            session.commit()',
            '            return',
            '        except StaleDataError:',
            '            session.rollback()',
          ),
          'tests/test_orders.py',
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
