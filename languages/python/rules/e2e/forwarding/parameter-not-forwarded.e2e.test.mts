import { describe } from 'vitest';
import { useRuleScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useRuleScripts('parameter-not-forwarded', { enabled });

const BASE = [
  'class Base:',
  '    def parse(self, result, *, partial=False):',
  '        return result',
  '',
  '    def run(self, a, b=None):',
  '        return a',
  '',
  '',
];

describe.skipIf(!enabled)('parameter-not-forwarded', () => {
  itOutcomes('reports a parameter left out of the call to the base method', [
    [
      'a keyword parameter that the override reads and the call drops',
      code(
        ...BASE,
        'class Child(Base):',
        '    def parse(self, result, *, partial=False):',
        '        if partial:',
        '            result = result.strip()',
        '        return super().parse(result)',
      ),
      ['parameter-not-forwarded:13 partial: Child.parse > super().parse'],
    ],
    [
      'a positional parameter with a default, and super(Class, self)',
      code(
        ...BASE,
        'class Child(Base):',
        '    def run(self, a, b=None):',
        '        if b:',
        '            print(b)',
        '        return super(Child, self).run(a)',
      ),
      ['parameter-not-forwarded:13 b: Child.run > super().run'],
    ],
    [
      'a base declared in another module',
      {
        files: {
          'base.py':
            'class Base:\n    def parse(self, result, *, partial=False):\n        return result\n',
          'mod.py':
            'from .base import Base\n\n\nclass Child(Base):\n    def parse(self, result, *, partial=False):\n        print(partial)\n        return super().parse(result)\n',
        },
      },
      ['parameter-not-forwarded:7 partial: Child.parse > super().parse'],
    ],
  ]);

  itOutcomes('leaves forwarded, narrowed and unknown base calls alone', [
    [
      'the parameter passed by keyword or position',
      code(
        ...BASE,
        'class Child(Base):',
        '    def parse(self, result, *, partial=False):',
        '        return super().parse(result, partial=partial)',
        '',
        '    def run(self, a, b=None):',
        '        return super().run(a, b)',
      ),
      [],
    ],
    [
      'own star arguments, foreign expansion, an unused parameter and a parameter the base lacks',
      code(
        ...BASE,
        'class Child(Base):',
        '    def parse(self, result, *args, **kwargs):',
        '        return super().parse(result, *args, **kwargs)',
        '',
        '    def run(self, a, extra=None, **other):',
        '        print(extra)',
        '        return super().run(a, **other)',
        '',
        '',
        'class Unused(Base):',
        '    def parse(self, result, *, partial=False):',
        '        return super().parse(result)',
        '',
        '',
        'class Unknown(Missing):',
        '    def parse(self, result, *, partial=False):',
        '        print(partial)',
        '        return super().parse(result)',
      ),
      [],
    ],
    [
      'a different method name',
      code(
        ...BASE,
        'class Child(Base):',
        '    def other(self, a, b=None):',
        '        print(b)',
        '        return super().run(a)',
      ),
      [],
    ],
  ]);

  itOutcomes('reports a keyword that a wrapper does not pass to its callee', [
    [
      'a parameter that the caller accepts, never uses and does not pass on',
      code(
        'def read(path, verbose=False):',
        '    return path',
        '',
        '',
        'def load(path, verbose=False):',
        '    return read(path)',
      ),
      ['parameter-not-forwarded:6 verbose: load > read'],
    ],
    [
      'a method that calls another method of its class',
      code(
        'class Client:',
        '    def fetch(self, url, timeout=None):',
        '        return url',
        '',
        '    def get(self, url, timeout=None):',
        '        return self.fetch(url)',
      ),
      ['parameter-not-forwarded:6 timeout: Client.get > fetch'],
    ],
  ]);

  itOutcomes('leaves wrappers that pass it, cover it by position or lack other forwarding alone', [
    [
      'passed by keyword, by position and expanded by the caller',
      code(
        'def read(path, verbose=False):',
        '    return path',
        '',
        '',
        'def a(path, verbose=False):',
        '    print(verbose)',
        '    return read(path, verbose=verbose)',
        '',
        '',
        'def b(path, verbose=False):',
        '    print(verbose)',
        '    return read(path, verbose)',
        '',
        '',
        'def c(path, options, verbose=False):',
        '    print(verbose)',
        '    return read(path, **options)',
      ),
      [],
    ],
    [
      'no other parameter forwarded, a keyword-only callee parameter without a default, an unused name',
      code(
        'def read(path, verbose=False, *, mode):',
        '    return path',
        '',
        '',
        'def a(verbose=False):',
        '    print(verbose)',
        '    return read("x")',
        '',
        '',
        'def b(path, mode):',
        '    print(mode)',
        '    return read(path)',
        '',
        '',
        'def c(path, verbose=False):',
        '    if verbose:',
        '        print("loading")',
        '    return read(path)',
      ),
      [],
    ],
    [
      'the caller uses the flag itself, or sets it in its own kwargs',
      code(
        'class Base:',
        '    def run(self, retries=None, **kwargs):',
        '        return retries',
        '',
        '',
        'class A(Base):',
        '    def run(self, retries=None, **kwargs):',
        '        print(retries)',
        '        kwargs["retries"] = retries',
        '        return super().run(**kwargs)',
        '',
        '',
        'class B(Base):',
        '    def run(self, retries=None, **kwargs):',
        '        print(retries)',
        '        kwargs.update(retries=retries)',
        '        return super().run(**kwargs)',
      ),
      [],
    ],
    [
      'a base with the same simple name that is imported from an installed package',
      {
        files: {
          'parser.py':
            'class Parser:\n    def parse(self, result, *, partial=False):\n        return result\n',
          'mod.py':
            'from langchain.schema import Parser\n\n\nclass Child(Parser):\n    def parse(self, result, *, partial=False):\n        print(partial)\n        return super().parse(result)\n',
        },
      },
      [],
    ],
  ]);

  itOutcomes('reports an __init__ parameter that serialize leaves out', [
    [
      'a trigger that drops one argument',
      code(
        'class BaseTrigger:',
        '    pass',
        '',
        '',
        'class MyTrigger(BaseTrigger):',
        '    def __init__(self, job_id, region_name=None):',
        '        self.job_id = job_id',
        '        self.region_name = region_name',
        '',
        '    def serialize(self):',
        '        return ("pkg.MyTrigger", {"job_id": self.job_id})',
      ),
      ['parameter-not-forwarded:11 region_name: MyTrigger.serialize'],
    ],
    [
      'a dotted class path without a trigger base',
      code(
        'class Job:',
        '    def __init__(self, a, b):',
        '        self.a, self.b = a, b',
        '',
        '    def serialize(self):',
        '        return "pkg.Job", {"a": self.a}',
      ),
      ['parameter-not-forwarded:6 b: Job.serialize'],
    ],
  ]);

  itOutcomes('leaves complete, spread and non-contract serialize methods alone', [
    [
      'every argument present, a renamed key read from self and a spread',
      code(
        'class BaseTrigger:',
        '    pass',
        '',
        '',
        'class A(BaseTrigger):',
        '    def __init__(self, job_id, region=None):',
        '        self.job_id, self.region = job_id, region',
        '',
        '    def serialize(self):',
        '        return ("pkg.A", {"job_id": self.job_id, "region": self.region})',
        '',
        '',
        'class B(BaseTrigger):',
        '    def __init__(self, job_id, region=None):',
        '        self.job_id, self.region = job_id, region',
        '',
        '    def serialize(self):',
        '        return ("pkg.B", {"id": self.job_id, "name": self.region})',
        '',
        '',
        'class C(BaseTrigger):',
        '    def __init__(self, job_id, **extra):',
        '        self.job_id, self.extra = job_id, extra',
        '',
        '    def serialize(self):',
        '        return ("pkg.C", {"job_id": self.job_id, **self.extra})',
      ),
      [],
    ],
    [
      'a serialize that is not the class path and dict contract, and a test file',
      {
        files: {
          'mod.py': code(
            'class Plain:',
            '    def __init__(self, a, b):',
            '        self.a, self.b = a, b',
            '',
            '    def serialize(self):',
            '        return {"a": self.a}',
            '',
            '',
            'class Pair:',
            '    def __init__(self, a, b):',
            '        self.a, self.b = a, b',
            '',
            '    def serialize(self):',
            '        return ("json", {"a": self.a})',
          ),
          'tests/test_mod.py': code(
            'class T:',
            '    def __init__(self, a, b):',
            '        pass',
            '',
            '    def serialize(self):',
            '        return ("pkg.T", {"a": 1})',
          ),
        },
      },
      [],
    ],
  ]);
});
