import {
  useRuleScripts,
  ruleLine,
  pythonLines as code,
} from '../../test-support/python-rule-scripts.mts';

const RULE = 'assert-on-external-state';
const found = ruleLine(RULE);
const { itOutcomes, describeRules } = useRuleScripts(RULE, {
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

const MODELS = [
  'from django.db import models',
  '',
  '',
  'class ImageAttachment(models.Model):',
  '    content_type = models.CharField(max_length=40, null=True)',
  '    name = models.CharField(max_length=40)',
  '',
  '',
];

describeRules(RULE, () => {
  itOutcomes('reports an assert on a value read from outside the function', [
    [
      'a cache read',
      code(
        'def render(cache, key):',
        '    value = cache.get(key)',
        '    assert value is not None',
        '    return value.name',
      ),
      [found(3, 'value|cache.get()')],
    ],
    [
      'a bare truthiness assert on a dict read',
      code(
        'def pick(payload):',
        '    item = payload.get("item")',
        '    assert item',
        '    return item',
      ),
      [found(3, 'item|payload.get()')],
    ],
    [
      'an assert directly on a get call',
      code('def start(metadata):', '    assert metadata.get("start") is not None'),
      [found(2, "metadata.get('start')|metadata.get()")],
    ],
    [
      'a first row of a query',
      code(
        'def owner(session, User):',
        '    row = session.query(User).first()',
        '    assert row',
        '    return row.name',
      ),
      [found(3, 'row|session.query(User).first()')],
    ],
    [
      'a key of a payload',
      code('def read(payload):', '    item = payload["item"]', '    assert item is not None'),
      [found(3, 'item|payload[]')],
    ],
    [
      'an attribute of a client result',
      code(
        'async def update(self):',
        '    current = await self.client.get_current()',
        '    assert current.item is not None',
        '    return current.item',
      ),
      [found(3, 'current.item|self.client.get_current()')],
    ],
    [
      'a nullable model field of a parameter',
      {
        files: {
          'models.py': code(...MODELS.slice(0, 7)),
          'service.py': code(
            'from models import ImageAttachment',
            '',
            '',
            'def thumbnail(attachment: ImageAttachment):',
            '    assert attachment.content_type',
            '    return attachment.content_type.split("/")',
          ),
        },
      },
      [found(5, 'attachment.content_type|ImageAttachment.content_type')],
    ],
    [
      'a nullable model field of a fetched row',
      code(
        ...MODELS,
        'def thumbnail(pk):',
        '    row = ImageAttachment.objects.filter(pk=pk).first()',
        '    assert row.content_type is not None',
      ),
      [found(11, 'row.content_type|ImageAttachment.content_type')],
    ],
  ]);

  itOutcomes('stays quiet for explicit checks and values the function produced', [
    [
      'a get with a default',
      code(
        'def pick(payload):',
        '    item = payload.get("item", 0)',
        '    assert item',
        '    return item',
      ),
      [],
    ],
    [
      'a module registry',
      code(
        'HANDLERS = {}',
        '',
        '',
        'def handler_for(kind):',
        '    handler = HANDLERS.get(kind)',
        '    assert handler',
        '    return handler',
      ),
      [],
    ],
    [
      'an instance registry',
      code(
        'class Bus:',
        '    def handler_for(self, kind):',
        '        handler = self._registry.get(kind)',
        '        assert handler is not None',
        '        return handler',
      ),
      [],
    ],
    [
      'a count that is never null',
      code(
        'def total(cursor):',
        '    row = cursor.execute("select count(*) from orders").fetchone()',
        '    assert row',
        '    return row[0]',
      ),
      [],
    ],
    [
      'an assert after an explicit guard on the same name',
      code(
        'def render(cache, key):',
        '    value = cache.get(key)',
        '    if value is None:',
        '        return None',
        '    assert value',
        '    return value.name',
      ),
      [],
    ],
    [
      'an explicit guard',
      code(
        'def render(cache, key):',
        '    value = cache.get(key)',
        '    if value is None:',
        '        raise LookupError(key)',
        '    return value.name',
      ),
      [],
    ],
    [
      'a dict the function filled',
      code(
        'def build(name):',
        '    values = {}',
        '    values["name"] = name',
        '    item = values.get("name")',
        '    assert item',
        '    return item',
      ),
      [],
    ],
    [
      'a value the function just created',
      code(
        'def build(make):',
        '    value = make()',
        '    assert value is not None',
        '    return value',
      ),
      [],
    ],
    [
      'a Django get that raises when missing',
      code(
        'def load(Order, pk):',
        '    order = Order.objects.get(pk=pk)',
        '    assert order',
        '    return order',
      ),
      [],
    ],
    [
      'a value written again before the assert',
      code(
        'def pick(payload):',
        '    item = payload.get("item")',
        '    item = item or 1',
        '    assert item',
        '    return item',
      ),
      [],
    ],
    [
      'a parameter without a source',
      code('def pick(item):', '    assert item is not None', '    return item'),
      [],
    ],
    [
      'a model field that is not nullable',
      code(
        ...MODELS,
        'def label(pk):',
        '    row = ImageAttachment.objects.filter(pk=pk).first()',
        '    assert row.name',
      ),
      [],
    ],
    [
      'a comparison of a read value',
      code(
        'def pick(payload):',
        '    item = payload.get("item")',
        '    assert item == 1',
        '    return item',
      ),
      [],
    ],
    ['an assert at module level', code('VALUE = {}.get("a")', 'assert VALUE'), []],
  ]);

  itOutcomes('stays quiet in test files', [
    [
      'a test helper',
      {
        file: 'tests/test_cache.py',
        code: code(
          'def check(cache, key):',
          '    value = cache.get(key)',
          '    assert value is not None',
        ),
      },
      [],
    ],
  ]);
});
