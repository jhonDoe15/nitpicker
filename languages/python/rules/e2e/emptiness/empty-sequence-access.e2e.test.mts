import { useScripts, inFile } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
  hidden: ['test-without-assertion', 'swallowed-exception', 'boolean-flag-parameter'],
});

describeRules('empty-sequence-access', () => {
  itOutcomes('flags min, max and the first or last item of a sequence that can be empty', [
    [
      'max of a list built by a comprehension with a filter',
      'def newest(versions):\n    releases = [v for v in versions if v.stable]\n    return max(releases)\n',
      ['empty-sequence-access:3 max(releases)'],
    ],
    [
      'min with a key over a filtered list',
      'def cheapest(lines):\n    lines_info = [line for line in lines if line.price]\n    return min(lines_info, key=lambda line: line.price)\n',
      ['empty-sequence-access:3 min(lines_info, key=lambda line: line.price)'],
    ],
    [
      'the first item of a list built by filter',
      'def first_even(numbers):\n    evens = list(filter(lambda n: n % 2 == 0, numbers))\n    return evens[0]\n',
      ['empty-sequence-access:3 evens[0]'],
    ],
    [
      'the last item of a queryset evaluated with list',
      'def newest_post(author):\n    posts = list(Post.objects.filter(author=author))\n    return posts[-1]\n',
      ['empty-sequence-access:3 posts[-1]'],
    ],
    [
      'an item of a project function that returns a list from a query',
      'def pending(user) -> list[Order]:\n    return list(Order.objects.filter(user=user, paid=False))\n\n\ndef oldest(user):\n    orders = pending(user)\n    return orders[0]\n',
      ['empty-sequence-access:7 orders[0]'],
    ],
    [
      'a comprehension indexed or reduced on the spot',
      'def pick(items):\n    first = [i for i in items if i.ok][0]\n    top = max(i.score for i in items if i.ok)\n    return first, top\n',
      [
        'empty-sequence-access:2 [i for i in items if i.ok][0]',
        'empty-sequence-access:3 max(i.score for i in items if i.ok)',
      ],
    ],
    [
      'a list parameter that the function tests for emptiness elsewhere',
      'def head(nodes: list[Node], first: bool):\n    if first:\n        return nodes[0]\n    if nodes:\n        return nodes[-1]\n    return None\n',
      ['empty-sequence-access:3 nodes[0]'],
    ],
    [
      'a method of the class that returns a list from a query, called on self',
      'class Orders:\n    def pending(self, user) -> list[Order]:\n        return list(Order.objects.filter(user=user))\n\n    def oldest(self, user):\n        return self.pending(user)[0]\n',
      ['empty-sequence-access:6 self.pending(user)[0]'],
    ],
    [
      'a guard that does not mention the sequence',
      'def newest(versions, strict):\n    releases = [v for v in versions if v.stable]\n    if strict:\n        return max(releases)\n    return None\n',
      ['empty-sequence-access:4 max(releases)'],
    ],
    [
      'a test file',
      inFile(
        'tests/test_mod.py',
        'def newest(versions):\n    releases = [v for v in versions if v.stable]\n    return max(releases)\n',
      ),
      [],
    ],
  ]);

  itOutcomes('leaves guarded, defaulted and known non-empty sequences alone', [
    [
      'a default argument',
      'def newest(versions):\n    releases = [v for v in versions if v.stable]\n    return max(releases, default=None)\n',
      [],
    ],
    [
      'an if on the sequence',
      'def newest(versions):\n    releases = [v for v in versions if v.stable]\n    if releases:\n        return max(releases)\n    return None\n',
      [],
    ],
    [
      'a length comparison in a condition and in an and operand',
      'def a(items):\n    rows = [i for i in items if i]\n    if len(rows) > 0:\n        return rows[0]\n    return None\n\n\ndef b(items):\n    rows = [i for i in items if i]\n    return len(rows) and rows[-1]\n',
      [],
    ],
    [
      'an early exit before the access',
      'def newest(versions):\n    releases = [v for v in versions if v.stable]\n    if not releases:\n        raise ValueError("no release")\n    return max(releases)\n',
      [],
    ],
    [
      'an assert and a conditional expression',
      'def a(items):\n    rows = [i for i in items if i]\n    assert rows\n    return rows[0]\n\n\ndef b(items):\n    rows = [i for i in items if i]\n    return rows[0] if rows else None\n',
      [],
    ],
    [
      'a try that catches ValueError or IndexError',
      'def a(items):\n    rows = [i for i in items if i]\n    try:\n        return max(rows)\n    except ValueError:\n        return None\n\n\ndef b(items):\n    try:\n        return [i for i in items if i][0]\n    except (KeyError, IndexError):\n        return None\n',
      [],
    ],
    [
      'next with a default and first on a queryset',
      'def a(items):\n    return next(iter([i for i in items if i]), None)\n\n\ndef b(user):\n    return Post.objects.filter(author=user).first()\n',
      [],
    ],
    [
      'a loop over the sequence and a comprehension over it',
      'def a(items):\n    rows = [i for i in items if i]\n    for row in rows:\n        print(rows[0], row)\n    return [rows[0] for _ in rows]\n',
      [],
    ],
    [
      'a sequence that grows before the access',
      'def a(items):\n    rows = [i for i in items if i]\n    rows.append(1)\n    return rows[0]\n',
      [],
    ],
    [
      'a rebound sequence and a parameter that is rebound',
      'def a(items):\n    rows = [i for i in items if i]\n    rows = rows or [1]\n    return rows[0]\n\n\ndef b(nodes: list[int]) -> int:\n    nodes = nodes or [0]\n    return nodes[0]\n',
      [],
    ],
    [
      'max of several values, other indexes and an unknown sequence',
      'def a(items, x, y):\n    rows = [i for i in items if i]\n    return max(x, y), rows[1], items[0], max(items), rows[0:1]\n',
      [],
    ],
    [
      'a list parameter that nothing tests for emptiness',
      'def head(nodes: list[int], sizes: list[int]) -> int:\n    return nodes[0] + max(sizes)\n',
      [],
    ],
    [
      'a length kept in a local, a match on the sequence and an any test over the same source',
      'def a(items):\n    rows = [i for i in items if i]\n    n = len(rows)\n    if n == 0:\n        return None\n    return rows[0]\n\n\ndef b(items):\n    rows = [i for i in items if i]\n    match rows:\n        case [_, *_]:\n            return rows[0]\n    return None\n\n\ndef c(items):\n    if not any(i.ok for i in items):\n        return None\n    return max(i.score for i in items if i.ok)\n',
      [],
    ],
    [
      'a method name that belongs to another receiver',
      'def pending_orders(user) -> list[Order]:\n    return list(Order.objects.filter(user=user))\n\n\ndef first(loader):\n    return loader.pending_orders()[0]\n',
      [],
    ],
    [
      'a tuple parameter, an unannotated parameter and a comprehension without a filter',
      'def a(pair: tuple[int, int], rest, items):\n    return pair[0], rest[0], max([i for i in items])\n',
      [],
    ],
    [
      'a query function without a list annotation',
      'def pending(user):\n    return list(Order.objects.filter(user=user))\n\n\ndef oldest(user):\n    return pending(user)[0]\n',
      [],
    ],
  ]);
});
