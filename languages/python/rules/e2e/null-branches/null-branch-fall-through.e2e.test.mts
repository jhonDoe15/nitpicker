import { useScripts, inFile } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('null-branch-fall-through', () => {
  itOutcomes('flags a None branch that continues into a use of the same value', [
    [
      'the example from the issue',
      'def write(out, formats, value, fmt):\n    if value is None:\n        out.append("null")\n    chosen = fmt\n    if chosen is None:\n        chosen = formats.get(type(value))\n    out.append(chosen.format(value))\n',
      ['null-branch-fall-through:2 value|chosen.format(value)'],
    ],
    [
      'a branch that only logs and continues',
      'def name(user):\n    if user is None:\n        print("no user")\n    return user.name\n',
      ['null-branch-fall-through:2 user|user.name'],
    ],
    [
      'an equality test with None',
      'def name(user):\n    if user == None:\n        print("no user")\n    return user.name\n',
      ['null-branch-fall-through:2 user|user.name'],
    ],
    [
      'a None on the left',
      'def name(user):\n    if None is user:\n        print("no user")\n    return user.name\n',
      ['null-branch-fall-through:2 user|user.name'],
    ],
    [
      'a subscript',
      'def first(items):\n    if items is None:\n        print("none")\n    return items[0]\n',
      ['null-branch-fall-through:2 items|items[0]'],
    ],
    [
      'an iteration',
      'def each(items):\n    if items is None:\n        print("none")\n    for item in items:\n        print(item)\n',
      ['null-branch-fall-through:2 items|for ... in items'],
    ],
    [
      'len of the value',
      'def size(items):\n    if items is None:\n        print("none")\n    return len(items)\n',
      ['null-branch-fall-through:2 items|len(items)'],
    ],
    [
      'an unpacking',
      'def pair(value):\n    if value is None:\n        print("none")\n    left, right = value\n    return left\n',
      ['null-branch-fall-through:2 value|left, right = value'],
    ],
    [
      'the call the branch stood in for',
      'def add(out, value):\n    if value is None:\n        out.append("null")\n    out.append(str(value))\n',
      ['null-branch-fall-through:2 value|str(value)'],
    ],
    [
      'an attribute of self',
      'class Box:\n    def label(self):\n        if self.item is None:\n            print("none")\n        return self.item.name\n',
      ['null-branch-fall-through:3 self.item|self.item.name'],
    ],
    [
      'only the first use',
      'def name(user):\n    if user is None:\n        print("no user")\n    first = user.first\n    return first + user.last\n',
      ['null-branch-fall-through:2 user|user.first'],
    ],
    [
      'a parameter whose branch calls a function',
      'def name(user):\n    if user is None:\n        prepare()\n    return user.name\n',
      ['null-branch-fall-through:2 user|user.name'],
    ],
    [
      'a use in a try block',
      'def name(user):\n    if user is None:\n        print("no user")\n    try:\n        return user.name\n    except KeyError:\n        raise\n',
      ['null-branch-fall-through:2 user|user.name'],
    ],
  ]);

  itOutcomes('leaves branches that leave, rebind or guard the later use alone', [
    [
      'a return',
      'def name(user):\n    if user is None:\n        print("no user")\n        return ""\n    return user.name\n',
      [],
    ],
    [
      'a raise',
      'def name(user):\n    if user is None:\n        raise ValueError("no user")\n    return user.name\n',
      [],
    ],
    [
      'a continue',
      'def names(users):\n    for user in users:\n        if user is None:\n            continue\n        print(user.name)\n',
      [],
    ],
    [
      'an exit',
      'import sys\n\n\ndef name(user):\n    if user is None:\n        sys.exit(1)\n    return user.name\n',
      [],
    ],
    [
      'an assignment to the value',
      'def name(user):\n    if user is None:\n        user = Guest()\n    return user.name\n',
      [],
    ],
    [
      'an else branch',
      'def name(user):\n    if user is None:\n        print("no user")\n    else:\n        print(user.name)\n',
      [],
    ],
    [
      'an empty branch',
      'def name(user):\n    if user is None:\n        pass\n    return user.name\n',
      [],
    ],
    [
      'a truthiness test',
      'def name(user):\n    if not user:\n        print("no user")\n    return user.name\n',
      [],
    ],
    [
      'a later guard',
      'def name(user):\n    if user is None:\n        print("no user")\n    return user.name if user is not None else ""\n',
      [],
    ],
    [
      'a later short-circuit',
      'def name(user):\n    if user is None:\n        print("no user")\n    return user and user.name\n',
      [],
    ],
    [
      'a later None check that returns',
      'def name(user):\n    if user is None:\n        print("no user")\n    if user is None:\n        return ""\n    return user.name\n',
      [],
    ],
    [
      'a function that is not called',
      'def name(user):\n    if user is None:\n        print("no user")\n    return lambda: user.name\n',
      [],
    ],
    [
      'another value',
      'def name(user, other):\n    if user is None:\n        print("no user")\n    return other.name\n',
      [],
    ],
    [
      'a lazily initialised attribute',
      'class Db:\n    def query(self):\n        if self.conn is None:\n            self.connect()\n        return self.conn.query()\n',
      [],
    ],
    [
      'a lazily initialised global',
      'cache = None\n\n\ndef get():\n    global cache\n    if cache is None:\n        load()\n    return cache.get()\n',
      [],
    ],
    [
      'a module variable set by a function',
      'cache = None\n\n\ndef get():\n    if cache is None:\n        load()\n    return cache.get()\n',
      [],
    ],
    [
      'a match on None',
      'def name(user):\n    if user is None:\n        print("no user")\n    match user:\n        case None:\n            return ""\n        case _:\n            return user.name\n',
      [],
    ],
    [
      'a failing helper',
      'def name(user):\n    if user is None:\n        print("no user")\n        fail("no user")\n    return user.name\n',
      [],
    ],
    [
      'a helper in the same file that only raises',
      'def stop():\n    raise ValueError("stop")\n\n\ndef name(user):\n    if user is None:\n        print("no user")\n        stop()\n    return user.name\n',
      [],
    ],
    [
      'an assert of the value',
      'def name(user):\n    if user is None:\n        print("no user")\n    assert user is not None\n    return user.name\n',
      [],
    ],
    [
      'an assert on the truth of the value',
      'def name(user):\n    if user is None:\n        print("no user")\n    assert user\n    return user.name\n',
      [],
    ],
    [
      'a test file',
      inFile(
        'tests/test_mod.py',
        'def helper(user):\n    if user is None:\n        print("no user")\n    return user.name\n',
      ),
      [],
    ],
  ]);
});
