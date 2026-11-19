import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({
  enabled,
  hidden: ['test-without-assertion', 'module-level-mutable-state'],
});

const DJANGO = [
  'from django.core.cache import cache, caches',
  'from django.db import transaction',
  '',
  '',
];
const REDIS = [
  'import redis',
  'from django.db import transaction',
  '',
  'client = redis.Redis()',
  '',
  '',
];
const SQLALCHEMY = [
  'from sqlalchemy.orm import Session',
  'import redis',
  '',
  'cache = redis.Redis()',
  '',
  '',
];

describe.skipIf(!enabled)('cache-write-in-transaction', () => {
  itOutcomes('flags a cache client written inside a transaction block', [
    [
      'a Django cache set in an atomic block',
      code(
        ...DJANGO,
        'def rename(user, name):',
        '    with transaction.atomic():',
        '        user.name = name',
        '        user.save()',
        '        cache.set(f"user:{user.id}", user)',
      ),
      ['cache-write-in-transaction:9 cache.set()|transaction.atomic()'],
    ],
    [
      'a Django cache delete in an atomic decorator',
      code(
        ...DJANGO,
        '@transaction.atomic',
        'def remove(user):',
        '    user.delete()',
        '    cache.delete_many(["a", "b"])',
      ),
      ['cache-write-in-transaction:8 cache.delete_many()|transaction.atomic()'],
    ],
    [
      'a Django named cache',
      code(
        ...DJANGO,
        'def rename(user):',
        '    with transaction.atomic():',
        '        user.save()',
        '        caches["sessions"].set("k", 1)',
      ),
      ["cache-write-in-transaction:8 caches['sessions'].set()|transaction.atomic()"],
    ],
    [
      'a redis client in an atomic block',
      code(
        ...REDIS,
        'def rename(user):',
        '    with transaction.atomic():',
        '        user.save()',
        '        client.setex("user", 60, user.name)',
      ),
      ['cache-write-in-transaction:10 client.setex()|transaction.atomic()'],
    ],
    [
      'a redis delete in a SQLAlchemy session block',
      code(
        ...SQLALCHEMY,
        'def remove(session: Session, user):',
        '    with session.begin():',
        '        session.delete(user)',
        '        cache.delete(f"user:{user.id}")',
      ),
      ['cache-write-in-transaction:10 cache.delete()|session.begin()'],
    ],
  ]);

  itOutcomes('flags a local dict filled with a value written in the transaction', [
    [
      'a Django create stored in a module dict',
      code(
        'from django.db import transaction',
        '',
        'USERS = {}',
        '',
        '',
        'def add(data):',
        '    with transaction.atomic():',
        '        user = User.objects.create(**data)',
        '        USERS[user.id] = user',
      ),
      ['cache-write-in-transaction:9 USERS[]|transaction.atomic()|local'],
    ],
    [
      'an added object stored in an instance dict',
      code(
        'class Users:',
        '    def __init__(self, session):',
        '        self.session = session',
        '        self.by_id = {}',
        '',
        '    def add(self, user):',
        '        with self.session.begin():',
        '            self.session.add(user)',
        '            self.session.flush()',
        '            self.by_id[user.id] = user',
      ),
      ['cache-write-in-transaction:10 by_id[]|self.session.begin()|local'],
    ],
  ]);

  itOutcomes('stays quiet for the after-commit forms and unrelated state', [
    [
      'a Django on_commit callback',
      code(
        ...DJANGO,
        'def rename(user):',
        '    with transaction.atomic():',
        '        user.save()',
        '        transaction.on_commit(lambda: cache.delete(f"user:{user.id}"))',
      ),
      [],
    ],
    [
      'a SQLAlchemy after_commit listener',
      code(
        ...SQLALCHEMY,
        'from sqlalchemy import event',
        '',
        '',
        '@event.listens_for(Session, "after_commit")',
        'def evict(session):',
        '    cache.delete("users")',
      ),
      [],
    ],
    [
      'a model named like a cache',
      code(
        ...DJANGO,
        'def purge(cache_entry):',
        '    with transaction.atomic():',
        '        cache_entry.delete()',
        '        cache_entry.set_expiry(1)',
      ),
      [],
    ],
    [
      'a cache write after the block',
      code(
        ...DJANGO,
        'def rename(user):',
        '    with transaction.atomic():',
        '        user.save()',
        '    cache.set(f"user:{user.id}", user)',
      ),
      [],
    ],
    [
      'a cache write without a transaction',
      code(...DJANGO, 'def warm(user):', '    cache.set("k", user)'),
      [],
    ],
    [
      'a cache read in the block',
      code(
        ...DJANGO,
        'def rename(user):',
        '    with transaction.atomic():',
        '        user.save()',
        '        previous = cache.get("k")',
        '    return previous',
      ),
      [],
    ],
    [
      'a dict that holds a value read in the block',
      code(
        'from django.db import transaction',
        '',
        'USERS = {}',
        '',
        '',
        'def load(user_id):',
        '    with transaction.atomic():',
        '        user = User.objects.get(id=user_id)',
        '        USERS[user.id] = user',
      ),
      [],
    ],
    [
      'a dict filled after the block',
      code(
        'from django.db import transaction',
        '',
        'USERS = {}',
        '',
        '',
        'def add(data):',
        '    with transaction.atomic():',
        '        user = User.objects.create(**data)',
        '    USERS[user.id] = user',
      ),
      [],
    ],
  ]);
});
