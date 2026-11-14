import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: ['test-without-assertion'],
});
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;

describe.skipIf(!enabled)('dual-write-without-outbox relays and branches', () => {
  it('leaves a relay, an outbox row with a kick and exclusive branches alone', () => {
    const [actual, expected] = outcomes([
      [
        'a relay that commits once per row',
        code(
          'from kafka import KafkaProducer',
          '',
          'producer = KafkaProducer()',
          '',
          '',
          'def relay(session):',
          '    for row in session.query(Outbox).all():',
          "        producer.send('orders', row.payload)",
          '        session.delete(row)',
          '        session.commit()',
        ),
        [],
      ],
      [
        'a relay that marks the rows after the loop',
        code(
          'from kafka import KafkaProducer',
          '',
          'producer = KafkaProducer()',
          '',
          '',
          'def relay(session):',
          '    rows = session.query(Outbox).all()',
          '    for row in rows:',
          "        producer.send('orders', row.payload)",
          "    session.query(Outbox).filter(Outbox.id.in_([r.id for r in rows])).update({'sent': True})",
        ),
        [],
      ],
      [
        'an outbox row and a relay kick',
        code(
          'from celery import shared_task',
          '',
          '',
          '@shared_task',
          'def drain_outbox():',
          '    return None',
          '',
          '',
          'def place(session, order):',
          '    session.add(OutboxMessage(order))',
          '    drain_outbox.delay()',
        ),
        [],
      ],
      [
        'a write and a send in different branches',
        code(
          'from kafka import KafkaProducer',
          '',
          'producer = KafkaProducer()',
          '',
          '',
          'def place(repo, order, ok):',
          '    if ok:',
          '        repo.save(order)',
          '    else:',
          "        producer.send('orders', order)",
          '',
          '',
          'def match_arms(repo, order, kind):',
          '    match kind:',
          "        case 'a':",
          '            repo.save(order)',
          '        case _:',
          "            producer.send('orders', order)",
          '',
          '',
          'def try_arms(repo, order):',
          '    try:',
          '        repo.save(order)',
          '    except ValueError:',
          "        producer.send('failed', order)",
        ),
        [],
      ],
      [
        'a write then a send after an if',
        code(
          'from kafka import KafkaProducer',
          '',
          'producer = KafkaProducer()',
          '',
          '',
          'def place(repo, order, ok):',
          '    if ok:',
          '        repo.save(order)',
          "    producer.send('orders', order)",
        ),
        ['dual-write-without-outbox:9 place|repo.save()|producer.send()'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
