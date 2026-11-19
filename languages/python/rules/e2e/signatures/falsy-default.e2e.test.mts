import { useScripts, inFile } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
  hidden: ['number-truthiness'],
});

describeRules('falsy-default', () => {
  itOutcomes('flags a None-defaulted parameter that `or` or a truthiness conditional replaces', [
    [
      'an assignment',
      'def page(limit: int | None = None) -> int:\n    size = limit or 10\n    return size\n',
      ['falsy-default:2 page(limit)'],
    ],
    [
      'a rebinding to itself with a non-empty default',
      'def pad(items: list[str] | None = None) -> list[str]:\n    items = items or ["a"]\n    return items\n',
      ['falsy-default:2 pad(items)'],
    ],
    [
      'a return',
      'def label(name: str = None) -> str:\n    return name or "all"\n',
      ['falsy-default:2 label(name)'],
    ],
    [
      'a call argument',
      'def run(timeout: float | None = None) -> None:\n    wait(timeout or 5.0)\n',
      ['falsy-default:2 run(timeout)'],
    ],
    [
      'a conditional expression on the value',
      'def label(name: str | None = None) -> str:\n    return name if name else "all"\n',
      ['falsy-default:2 label(name)'],
    ],
    [
      'a chain of alternatives',
      'def pick(first: int | None = None, second: int | None = None) -> int:\n    return first or second or 3\n',
      ['falsy-default:2 pick(first)', 'falsy-default:2 pick(second)'],
    ],
    [
      'an Optional without a default',
      'from typing import Optional\n\n\ndef scale(factor: Optional[float]) -> float:\n    return factor or 1.0\n',
      ['falsy-default:5 scale(factor)'],
    ],
    [
      'a method',
      'class Pager:\n    def size(self, limit: int | None = None) -> int:\n        return limit or 10\n',
      ['falsy-default:3 Pager.size(limit)'],
    ],
    [
      'one finding per parameter',
      'def page(limit: int | None = None) -> int:\n    first = limit or 10\n    return (limit or 20) + first\n',
      ['falsy-default:2 page(limit)'],
    ],
    [
      'a QuerySet parameter replaced by an or default',
      'from django.db.models import QuerySet\n\n\ndef visible(qs: QuerySet[Row] | None = None) -> QuerySet[Row]:\n    return qs or Row.objects.all()\n',
      ['falsy-default:5 visible(qs)'],
    ],
    [
      'an untyped None parameter replaced by a queryset through or',
      'def visible(user, qs=None):\n    qs = qs or Attribute.objects.filter(owner=user)\n    return qs\n',
      ['falsy-default:2 visible(qs)'],
    ],
    [
      'a custom queryset method of a project queryset class',
      'from django.db import models\n\n\nclass AttributeQuerySet(models.QuerySet):\n    def visible_to(self, user):\n        return self.filter(owner=user)\n\n\ndef visible(user, qs=None):\n    qs = qs or Attribute.objects.visible_to(user)\n    return qs\n',
      ['falsy-default:10 visible(qs)'],
    ],
    [
      'an untyped None parameter replaced by a queryset in a conditional expression',
      'def visible(qs=None):\n    return qs if qs else Row.objects.filter(live=True)\n',
      ['falsy-default:2 visible(qs)'],
    ],
  ]);

  itOutcomes('leaves None tests, conditions and parameters of other types alone', [
    [
      'an empty default, which the falsy value already is',
      'def pad(items: list[str] | None = None, name: str | None = None, n: int | None = None) -> None:\n    first = items or []\n    second = name or ""\n    third = n or 0\n    fourth = items or list()\n    fifth = name if name else ""\n',
      [],
    ],
    [
      'a None test',
      'def page(limit: int | None = None) -> int:\n    return limit if limit is not None else 10\n',
      [],
    ],
    [
      'a None check before the or',
      'def page(limit: int | None = None) -> int:\n    if limit is None:\n        limit = 1\n    return limit or 10\n',
      [],
    ],
    [
      'a condition',
      'def page(limit: int | None = None, name: str | None = None) -> bool:\n    if limit or name:\n        return True\n    return bool(limit or name) and not (limit or name)\n',
      [],
    ],
    [
      'a comprehension filter and an assert',
      'def keep(items: list[int], limit: int | None = None) -> list[int]:\n    assert limit or items\n    return [item for item in items if limit or item]\n',
      [],
    ],
    [
      'a class without a falsy value',
      'from pathlib import Path\n\n\ndef where(root: Path | None = None) -> Path:\n    return root or Path.cwd()\n',
      [],
    ],
    ['an unannotated parameter', 'def label(name=None):\n    return name or "all"\n', []],
    [
      'a project class',
      'def build(config: Config | None = None) -> Config:\n    return config or Config()\n',
      [],
    ],
    [
      'a parameter without a None default',
      'def label(name: str = "x") -> str:\n    return name or "all"\n',
      [],
    ],
    [
      'a local variable',
      'def label(values: list[str]) -> str:\n    name = values[0] if values else None\n    return name or "all"\n',
      [],
    ],
    [
      'a queryset parameter that is compared with None',
      'def visible(qs=None):\n    if qs is None:\n        qs = Row.objects.all()\n    return qs or Row.objects.none()\n',
      [],
    ],
    [
      'an untyped parameter with a terminal ORM call as the fallback',
      'def pick(row=None):\n    return row or Row.objects.first()\n',
      [],
    ],
    [
      'a manager method that returns a row, and one annotated with a non-queryset type',
      'from django.db import models\n\n\nclass ReadingManager(models.Manager):\n    def newest(self, user):\n        return self.get(owner=user)\n\n    def count_for(self, user) -> int:\n        return self.filter(owner=user).count()\n\n\ndef pick(user, row=None):\n    first = row or Reading.objects.newest(user)\n    return first or Reading.objects.count_for(user)\n',
      [],
    ],
    [
      'a copy of a non-queryset manager-like attribute',
      'def pick(scene, cache=None):\n    return cache or scene.objects.copy()\n',
      [],
    ],
    [
      'a test file',
      inFile(
        'tests/test_mod.py',
        'def helper(limit: int | None = None) -> int:\n    return limit or 10\n',
      ),
      [],
    ],
  ]);
});
