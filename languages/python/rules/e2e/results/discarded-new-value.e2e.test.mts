import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({
  enabled,
  hidden: ['test-without-assertion', 'swallowed-exception'],
});

const DATES = ['from datetime import datetime, timedelta, timezone', '', ''];
const PATHS = ['from pathlib import Path', '', ''];
const MODELS = [
  'from django.db import models',
  '',
  '',
  'class Realm(models.Model):',
  '    pass',
  '',
  '',
];

describe.skipIf(!enabled)('discarded-new-value', () => {
  itOutcomes('flags a new-value method whose result is thrown away', [
    [
      'a queryset filter on a manager',
      code(
        ...MODELS,
        'def count(public):',
        '    query = Realm.objects.all()',
        '    query.filter(id__in=public)',
        '    return query.count()',
      ),
      ['discarded-new-value:10 QuerySet.filter()'],
    ],
    [
      'a chained queryset call on the manager itself',
      code(...MODELS, 'def touch():', '    Realm.objects.exclude(id=1).order_by("id")'),
      ['discarded-new-value:9 QuerySet.order_by()'],
    ],
    [
      'a datetime replace on a value from now()',
      code(
        ...DATES,
        'def clean():',
        '    expires = datetime.now(timezone.utc)',
        '    expires.replace(microsecond=0)',
        '    return expires',
      ),
      ['discarded-new-value:6 datetime.replace()'],
    ],
    [
      'a datetime replace on an annotated parameter',
      code(
        'import datetime',
        '',
        '',
        'def clean(moment: datetime.datetime):',
        '    moment.replace(microsecond=0)',
      ),
      ['discarded-new-value:5 datetime.replace()'],
    ],
    [
      'a string method on an annotated parameter',
      code('def clean(name: str):', '    name.strip()', '    return name'),
      ['discarded-new-value:2 str.strip()'],
    ],
    [
      'a string method on a literal and on a bytes value',
      code('def run(raw: bytes):', '    "a-b".replace("-", "_")', '    raw.lower()'),
      ['discarded-new-value:2 str.replace()', 'discarded-new-value:3 bytes.lower()'],
    ],
    [
      'a string method on a local built from a string',
      code('def run(user):', '    label = f"user {user}"', '    label.upper()', '    return label'),
      ['discarded-new-value:3 str.upper()'],
    ],
    [
      'a path method',
      code(
        ...PATHS,
        'def run(name):',
        '    target = Path(name)',
        '    target.with_suffix(".txt")',
        '    return target',
      ),
      ['discarded-new-value:6 Path.with_suffix()'],
    ],
    [
      'a frozenset operation',
      code('def run(items):', '    seen = frozenset(items)', '    seen.union({1})'),
      ['discarded-new-value:3 frozenset.union()'],
    ],
    [
      'a chain on a value reassigned from its own result',
      code('def run(text: str):', '    text = text.strip()', '    text.lower()', '    return text'),
      ['discarded-new-value:3 str.lower()'],
    ],
  ]);

  itOutcomes('flags a call in a try without handlers', [
    [
      'a try with only a finally block',
      code(
        'def run(text: str):',
        '    try:',
        '        text.strip()',
        '    finally:',
        '        print("done")',
      ),
      ['discarded-new-value:3 str.strip()'],
    ],
  ]);

  itOutcomes('flags a truth test of a tuple result', [
    [
      'bool of a queryset delete',
      code(
        ...MODELS,
        'def purge(ids):',
        '    return bool(Realm.objects.filter(id__in=ids).delete())',
      ),
      ['discarded-new-value:9 QuerySet.delete()|truth'],
    ],
    [
      'an if on update_or_create',
      code(
        ...MODELS,
        'def sync(key):',
        '    if Realm.objects.update_or_create(key=key):',
        '        return 1',
      ),
      ['discarded-new-value:9 QuerySet.update_or_create()|truth'],
    ],
    [
      'not and or around get_or_create',
      code(...MODELS, 'def sync(key):', '    return not Realm.objects.get_or_create(key=key)'),
      ['discarded-new-value:9 QuerySet.get_or_create()|truth'],
    ],
  ]);

  itOutcomes('stays quiet when the result is used or the receiver is not known', [
    [
      'assigned and returned results',
      code(
        ...MODELS,
        'def count(public, expires: str):',
        '    query = Realm.objects.all()',
        '    query = query.filter(id__in=public)',
        '    expires = expires.strip()',
        '    return query.exclude(id=1), expires.replace("a", "b")',
      ),
      [],
    ],
    [
      'a datetime replace assigned back',
      code(
        ...DATES,
        'def clean():',
        '    expires = datetime.now()',
        '    expires = expires.replace(microsecond=0)',
        '    return expires',
      ),
      [],
    ],
    [
      'a parameter without a type',
      code(
        'def run(items):',
        '    items.replace("a", "b")',
        '    items.filter(1)',
        '    items.strip()',
      ),
      [],
    ],
    [
      'a project object with a side-effecting method of the same name',
      code(
        'class Buffer:',
        '    def strip(self):',
        '        self.data = []',
        '',
        '',
        'def run():',
        '    buffer = Buffer()',
        '    buffer.strip()',
      ),
      [],
    ],
    [
      'a name bound by a loop or another module',
      code('def run(items, text: str):', '    for text in items:', '        text.strip()'),
      [],
    ],
    [
      'a call checked for the error it raises',
      code(
        'def valid(text: str):',
        '    try:',
        '        text.format()',
        '    except KeyError:',
        '        return False',
        '    return True',
      ),
      [],
    ],
    [
      'a set updated in place and a list sorted in place',
      code(
        'def run(items):',
        '    seen = set(items)',
        '    seen.update([1])',
        '    seen.add(2)',
        '    items.sort()',
      ),
      [],
    ],
    [
      'a delete whose count is unpacked',
      code(
        ...MODELS,
        'def purge(ids):',
        '    count, _ = Realm.objects.filter(id__in=ids).delete()',
        '    return count > 0',
      ),
      [],
    ],
    [
      'a get_or_create unpacked before the test',
      code(
        ...MODELS,
        'def sync(key):',
        '    row, created = Realm.objects.get_or_create(key=key)',
        '    if created:',
        '        return row',
      ),
      [],
    ],
    [
      'a session delete and a request delete',
      code(
        'import requests',
        '',
        '',
        'def run(session, url):',
        '    if session.delete(url):',
        '        return requests.delete(url)',
      ),
      [],
    ],
  ]);

  itOutcomes('stays quiet for checks that are made for the error or the existence', [
    [
      'a path traversal check and a strict resolve',
      code(
        ...PATHS,
        'def run(name, base):',
        '    target = Path(name)',
        '    target.relative_to(base)',
        '    target.resolve(strict=True)',
        '    return target',
      ),
      [],
    ],
    [
      'a plain resolve is still reported',
      code(...PATHS, 'def run(name):', '    target = Path(name)', '    target.resolve()'),
      ['discarded-new-value:6 Path.resolve()'],
    ],
  ]);

  itOutcomes('skips test files', [
    [
      'a discarded replace in a test',
      {
        file: 'tests/test_dates.py',
        code: code('def test_replace(value: str):', '    value.strip()'),
      },
      [],
    ],
  ]);
});
