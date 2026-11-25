import {
  inFile,
  pythonLines,
  ruleLine,
  useRuleScripts,
} from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

const REPEATED_CALL = ruleLine('repeated-call');
const repeatedCall = useRuleScripts('repeated-call', { enabled });

repeatedCall.describeRules('repeated-call', () => {
  repeatedCall.itOutcomes('flags tested-then-used calls and repeated recursion', [
    [
      'and test then attribute read',
      pythonLines('def check(key):', '    return lookup(key) is not None and lookup(key).enabled'),
      [REPEATED_CALL(2, 'call|lookup(key)')],
    ],
    [
      'ternary test then method call',
      pythonLines(
        'def check(node):',
        '    return resolve(node).get() if resolve(node).is_present() else None',
      ),
      [REPEATED_CALL(2, 'call|resolve(node)')],
    ],
    [
      'if test then return attribute',
      pythonLines(
        'def check(key):',
        '    if lookup(key):',
        '        return lookup(key).enabled',
        '    return False',
      ),
      [REPEATED_CALL(3, 'call|lookup(key)')],
    ],
    [
      'method on self tested then assigned',
      pythonLines(
        'class Types:',
        '    def type_of(self, name):',
        '        return None',
        '    def check(self, name):',
        '        if self.type_of(name) is not None:',
        '            found = self.type_of(name)',
        '            return found',
        '        return ""',
      ),
      [REPEATED_CALL(6, 'call|self.type_of(name)')],
    ],
    [
      'json.loads tested then subscripted',
      pythonLines(
        'import json',
        'def extract(text):',
        '    return json.loads(text)["ok"] is True and json.loads(text)["value"]',
      ),
      [REPEATED_CALL(3, 'call|json.loads(text)')],
    ],
    [
      'recursive call repeated in loop body',
      pythonLines(
        'def type_of(call):',
        '    for argument in call.args:',
        '        direct = type_of(argument)',
        '        again = type_of(argument)',
        '        if direct != again:',
        '            return direct',
        '    return ""',
      ),
      [REPEATED_CALL(4, 'recursion|type_of|type_of(argument)')],
    ],
    [
      'recursive call repeated in expression',
      pythonLines(
        'def height(node):',
        '    if node.left:',
        '        return 1 + max(height(node.left), height(node.left))',
        '    return 0',
      ),
      [REPEATED_CALL(3, 'recursion|height|height(node.left)')],
    ],
  ]);

  repeatedCall.itOutcomes('allows locals, cheap methods, verbs, cached recursion, and mutations', [
    [
      'kept in a local',
      pythonLines(
        'def check(key):',
        '    found = lookup(key)',
        '    return found is not None and found.enabled',
      ),
      [],
    ],
    [
      'awaited call skipped',
      pythonLines(
        'async def check(path):',
        '    return (await stat(path)).size > 0 and (await stat(path)).is_file()',
      ),
      [],
    ],
    [
      'os.stat filesystem call skipped',
      pythonLines(
        'import os',
        'def check(path):',
        '    if os.stat(path):',
        '        return os.stat(path).st_size',
        '    return 0',
      ),
      [],
    ],
    [
      'cheap dict.get skipped',
      pythonLines(
        'def check(mapping, key):',
        '    return mapping.get(key) is not None and mapping.get(key) > 1',
      ),
      [],
    ],
    [
      'verb method next_item skipped',
      pythonLines(
        'def check(queue):',
        '    return queue.next_item(1) is not None and queue.next_item(1)',
      ),
      [],
    ],
    [
      'leading-underscore verb _match skipped',
      pythonLines(
        'class Scanner:',
        '    def _match(self, code):',
        '        return code > 0',
        '    def scan(self):',
        '        if self._match(61):',
        '            return self._match(61)',
        '        return False',
      ),
      [],
    ],
    [
      'builtin int comparison skipped',
      pythonLines('def check(value):', '    return int(value) > 0 and int(value) < 10'),
      [],
    ],
    [
      'different arguments skipped',
      pythonLines(
        'def check(key, other):',
        '    return lookup(key) is not None and lookup(other).enabled',
      ),
      [],
    ],
    [
      'unsettled argument skipped',
      pythonLines(
        'def check(keys):',
        '    return lookup(keys.pop()) is not None and lookup(keys.pop()).enabled',
      ),
      [],
    ],
    [
      'intervening call in and skipped',
      pythonLines(
        'def check(key):',
        '    return lookup(key) is not None and audit() and lookup(key).enabled',
      ),
      [],
    ],
    [
      'intervening statement in if body skipped',
      pythonLines(
        'def check(key):',
        '    if lookup(key):',
        '        audit()',
        '        return lookup(key)',
        '    return None',
      ),
      [],
    ],
    [
      'recursion with different arguments',
      pythonLines('def fib(n):', '    return n if n < 2 else fib(n - 1) + fib(n - 2)'),
      [],
    ],
    [
      'recursion on different branches',
      pythonLines(
        'def walk(node):',
        '    if node.left:',
        '        return walk(node.left)',
        '    return walk(node.left)',
      ),
      [],
    ],
    [
      'recursion with functools.cache',
      pythonLines(
        'import functools',
        '@functools.cache',
        'def height(node):',
        '    return 1 + max(height(node.left), height(node.left))',
      ),
      [],
    ],
    [
      'recursion with memo dict',
      pythonLines(
        'memo = {}',
        'def depth(node):',
        '    if node in memo:',
        '        return memo[node]',
        '    value = depth(node) + depth(node)',
        '    memo[node] = value',
        '    return value',
      ),
      [],
    ],
    [
      'recursion mutating reader state',
      pythonLines(
        'def read_tree(reader):',
        '    if reader.pos > 3:',
        '        return None',
        '    reader.pos += 1',
        '    first = read_tree(reader)',
        '    second = read_tree(reader)',
        '    return (first, second)',
      ),
      [],
    ],
    [
      'recursion with nonlocal mutation',
      pythonLines(
        'def make(src):',
        '    pos = 0',
        '    def parse_value(depth):',
        '        nonlocal pos',
        '        if src[pos] == "]":',
        '            pos += 1',
        '            return []',
        '        key = parse_value(depth + 1)',
        '        val = parse_value(depth + 1)',
        '        return [key, val]',
        '    return parse_value(0)',
      ),
      [],
    ],
    [
      'recursion calling verb method',
      pythonLines(
        'def walk(reader, limit):',
        '    if reader.next() > limit:',
        '        return 0',
        '    return walk(reader, limit) + walk(reader, limit)',
      ),
      [],
    ],
    [
      'recursion with discarded results',
      pythonLines('def emit(node):', '    emit(node)', '    emit(node)'),
      [],
    ],
    [
      'recursion with reassigned argument',
      pythonLines(
        'def walk(node):',
        '    at = node',
        '    first = walk(at)',
        '    at = at.next',
        '    return first + walk(at)',
      ),
      [],
    ],
    [
      'test file skipped',
      inFile(
        'tests/test_calls.py',
        pythonLines(
          'def test_check(key):',
          '    return lookup(key) is not None and lookup(key).enabled',
        ),
      ),
      [],
    ],
  ]);
});
