import { useScripts, inFile } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

const domain = (code: string) => inFile('shop/domain/prices.py', code);

describeRules('mutating-method-in-domain', () => {
  itOutcomes('flags a mutator on a parameter the function did not create', [
    [
      'an unannotated list parameter',
      domain('def f(items):\n    items.append(1)\n    return items\n'),
      ['mutating-method-in-domain:2 items.append (f)'],
    ],
    [
      'a private helper with a typed parameter',
      domain('def _f(items: list[int]) -> None:\n    items.sort()\n'),
      ['mutating-method-in-domain:2 items.sort (_f)'],
    ],
    [
      'a set and a dict',
      domain(
        'def f(seen, table):\n    seen.discard(1)\n    table.setdefault("a", 1)\n    table.update({})\n',
      ),
      [
        'mutating-method-in-domain:2 seen.discard (f)',
        'mutating-method-in-domain:3 table.setdefault (f)',
      ],
    ],
    [
      'a method',
      domain('class A:\n    def f(self, items):\n        items.extend([1])\n'),
      ['mutating-method-in-domain:3 items.extend (A.f)'],
    ],
  ]);

  itOutcomes('allows a value the function created or copied', [
    [
      'a local list built and filled',
      domain(
        'def f(items):\n    out = []\n    for x in items:\n        out.append(x)\n    out.sort()\n    return out\n',
      ),
      [],
    ],
    [
      'a parameter replaced by a copy first',
      domain('def f(items):\n    items = list(items)\n    items.append(1)\n    return items\n'),
      [],
    ],
    ['a comprehension', domain('def f(items):\n    return [x for x in items if x]\n'), []],
    ['an unannotated insert', domain('def f(repo):\n    repo.insert(1)\n'), []],
    ['an unannotated generic mutator name', domain('def f(session):\n    session.add(1)\n'), []],
    [
      'a method outside the domain',
      inFile('shop/service/prices.py', 'def f(items):\n    items.append(1)\n'),
      [],
    ],
    [
      'a test file',
      inFile('tests/domain/test_prices.py', 'def f(items):\n    items.append(1)\n'),
      [],
    ],
  ]);
});
