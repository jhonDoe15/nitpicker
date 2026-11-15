import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({ hidden: ['test-without-assertion'] });
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const DJANGO = ['from django.db import models, transaction', '', '', ''];

describe.skipIf(!enabled)('check-then-write-race', () => {
  it('flags a read that decides a write to the same model', () => {
    const [actual, expected] = outcomes([
      [
        'an exists check before a create',
        code(
          ...DJANGO,
          'def start(user):',
          '    if not Project.objects.filter(owner=user).exists():',
          '        Project.objects.create(owner=user)',
        ),
        [
          'check-then-write-race:7 start|Project.objects.filter(...).exists()|Project.objects.create()',
        ],
      ],
      [
        'a count compared with a limit before a create',
        code(
          ...DJANGO,
          'def start(user):',
          '    count = Project.objects.filter(owner=user).count()',
          '    if count >= 5:',
          '        raise ValueError("limit")',
          '    Project.objects.create(owner=user)',
        ),
        [
          'check-then-write-race:9 start|Project.objects.filter(...).count()|Project.objects.create()',
        ],
      ],
      [
        'a get with a DoesNotExist handler that creates',
        code(
          ...DJANGO,
          'def start(user):',
          '    try:',
          '        return Project.objects.get(owner=user)',
          '    except Project.DoesNotExist:',
          '        return Project.objects.create(owner=user)',
        ),
        ['check-then-write-race:9 start|Project.objects.get()|Project.objects.create()'],
      ],
      [
        'a SQLAlchemy count before an add',
        code(
          'def start(session, name):',
          '    if session.query(User).filter(User.name == name).count() == 0:',
          '        session.add(User(name=name))',
        ),
        ['check-then-write-race:3 start|session.query(...).filter(...).count()|session.add()'],
      ],
      [
        'a SQLAlchemy scalar select before an add',
        code(
          'from sqlalchemy import select',
          '',
          '',
          'def start(session, name):',
          '    existing = session.scalar(select(User).where(User.name == name))',
          '    if existing is None:',
          '        session.add(User(name=name))',
        ),
        ['check-then-write-race:7 start|session.scalar()|session.add()'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('leaves atomic forms, locks, handled conflicts and other models alone', () => {
    const [actual, expected] = outcomes([
      [
        'get_or_create',
        code(...DJANGO, 'def start(user):', '    return Project.objects.get_or_create(owner=user)'),
        [],
      ],
      [
        'a row lock',
        code(
          ...DJANGO,
          'def start(user):',
          '    with transaction.atomic():',
          '        if not Project.objects.select_for_update().filter(owner=user).exists():',
          '            Project.objects.create(owner=user)',
        ),
        [],
      ],
      [
        'a SQLAlchemy row lock',
        code(
          'def start(session, name):',
          '    found = session.query(User).with_for_update().filter(User.name == name).first()',
          '    if found is None:',
          '        session.add(User(name=name))',
        ),
        [],
      ],
      [
        'a write inside a transaction block',
        code(
          ...DJANGO,
          'def start(user):',
          '    if not Project.objects.filter(owner=user).exists():',
          '        with transaction.atomic():',
          '            Project.objects.create(owner=user)',
        ),
        [],
      ],
      [
        'a create that handles the unique constraint error',
        code(
          'from django.db import IntegrityError, models',
          '',
          '',
          'def start(user):',
          '    if not Project.objects.filter(owner=user).exists():',
          '        try:',
          '            Project.objects.create(owner=user)',
          '        except IntegrityError:',
          '            raise',
        ),
        [],
      ],
      [
        'a check of one model and a write of another',
        code(
          ...DJANGO,
          'def start(user):',
          '    if Project.objects.filter(owner=user).exists():',
          '        Audit.objects.create(owner=user)',
        ),
        [],
      ],
      [
        'a decorated atomic function',
        code(
          ...DJANGO,
          '@transaction.atomic',
          'def start(user):',
          '    if not Project.objects.filter(owner=user).exists():',
          '        Project.objects.create(owner=user)',
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
