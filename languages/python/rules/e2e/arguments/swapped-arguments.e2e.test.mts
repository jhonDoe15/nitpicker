import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({ enabled, hidden: ['test-without-assertion'] });

const PIPE = ['def _pipe(docs, proc, kwargs):', '    return proc(docs, **kwargs)', '', ''];

describe.skipIf(!enabled)('swapped-arguments', () => {
  itOutcomes('flags an argument named like a different parameter', [
    [
      'the spaCy pipe call',
      code(
        ...PIPE,
        'def run(docs, pipeline, kwargs):',
        '    for name, pipe in pipeline:',
        '        docs = _pipe(pipe, docs, kwargs)',
        '    return docs',
      ),
      ['swapped-arguments:7 docs|proc|pipe|docs'],
    ],
    [
      'two swapped arguments, reported once',
      code(
        'def copy(source, target):',
        '    target.write(source.read())',
        '',
        '',
        'def run(source, target):',
        '    copy(target, source)',
      ),
      ['swapped-arguments:6 target|source|source|target'],
    ],
    [
      'max passed into min',
      code(
        'def clamp(value, min, max):',
        '    return value',
        '',
        '',
        'def run(value, min, max):',
        '    return clamp(value, max, min)',
      ),
      ['swapped-arguments:6 max|min|min|max'],
    ],
    [
      'two swapped pairs in one call',
      code(
        'def two(source, target, input, output):',
        '    return source, target, input, output',
        '',
        '',
        'def run(source, target, input, output):',
        '    return two(target, source, output, input)',
      ),
      [
        'swapped-arguments:6 output|input|input|output',
        'swapped-arguments:6 target|source|source|target',
      ],
    ],
    [
      'a method called on self with underscored names',
      code(
        'class Mailer:',
        '    def _send(self, subject, body):',
        '        return subject, body',
        '',
        '    def run(self, subject, body):',
        '        return self._send(body, subject)',
      ),
      ['swapped-arguments:6 body|subject|subject|body'],
    ],
    [
      'an attribute of self named like another parameter',
      code(
        'class Mailer:',
        '    def __init__(self, body):',
        '        self.body = body',
        '',
        '    def run(self, subject):',
        '        return send(self.body, subject)',
        '',
        '',
        'def send(subject, body):',
        '    return subject, body',
      ),
      ['swapped-arguments:6 body|subject|subject|body'],
    ],
    [
      'a function imported from the project',
      {
        files: {
          'pkg/__init__.py': '',
          'pkg/tools.py': code('def merge(base, extra):', '    return {**base, **extra}'),
          'pkg/main.py': code(
            'from pkg.tools import merge',
            '',
            '',
            'def run(base, extra):',
            '    return merge(extra, base)',
          ),
        },
      },
      ['swapped-arguments:5 extra|base|base|extra'],
    ],
  ]);

  itOutcomes('stays quiet for the right order and unknowable calls', [
    [
      'a recursive call that passes the child and the node',
      code(
        'def walk(node, parent):',
        '    for child in node.children:',
        '        walk(child, node)',
      ),
      [],
    ],
    [
      'a recursive method call',
      code(
        'class Visitor:',
        '    def visit(self, node, parent):',
        '        for child in node.children:',
        '            self.visit(child, node)',
      ),
      [],
    ],
    [
      'names that moved to an earlier slot',
      code(
        'def step(prev, cur):',
        '    return prev, cur',
        '',
        '',
        'def link(parent, child):',
        '    return parent, child',
        '',
        '',
        'def edge(from_, to):',
        '    return from_, to',
        '',
        '',
        'def run(prev, cur, next, child, grandchild, to):',
        '    step(cur, next)',
        '    link(child, grandchild)',
        '    edge(to, next)',
      ),
      [],
    ],
    [
      'a classmethod whose first parameter is not cls',
      code(
        'class Maker:',
        '    @classmethod',
        '    def make(klass, src, dst):',
        '        return src, dst',
        '',
        '    def run(self, src, dst):',
        '        return self.make(src, dst)',
      ),
      [],
    ],
    [
      'a module function whose first parameter is self',
      {
        files: {
          'pkg/__init__.py': '',
          'pkg/renderers.py': code(
            'def render(self, request, context):',
            '    return self, request, context',
          ),
          'pkg/main.py': code(
            'from pkg import renderers',
            '',
            '',
            'def run(self, request, context):',
            '    return renderers.render(self, request, context)',
          ),
        },
      },
      [],
    ],
    [
      'a parameter or local that shadows a module function',
      code(
        'def copy(src, dst):',
        '    return src, dst',
        '',
        '',
        'def run(copy, src, dst):',
        '    return copy(dst, src)',
        '',
        '',
        'def other(src, dst):',
        '    copy = lambda dst, src: (dst, src)',
        '    return copy(dst, src)',
      ),
      [],
    ],
    [
      'arguments in order',
      code(...PIPE, 'def run(docs, pipe, kwargs):', '    return _pipe(docs, pipe, kwargs)'),
      [],
    ],
    [
      'keyword arguments',
      code(
        ...PIPE,
        'def run(docs, pipe, kwargs):',
        '    return _pipe(proc=docs, docs=pipe, kwargs=kwargs)',
      ),
      [],
    ],
    [
      'single letter names',
      code(
        'def minus(a, b):',
        '    return a - b',
        '',
        '',
        'def run(a, b):',
        '    return minus(b, a)',
      ),
      [],
    ],
    [
      'names that differ by a number',
      code(
        'def distance(x1, x2):',
        '    return x2 - x1',
        '',
        '',
        'def run(x1, x2):',
        '    return distance(x2, x1)',
      ),
      [],
    ],
    [
      'left and right',
      code(
        'def join(left, right):',
        '    return left + right',
        '',
        '',
        'def run(left, right):',
        '    return join(right, left)',
      ),
      [],
    ],
    [
      'a callee outside the project',
      code('import os', '', '', 'def run(path, start):', '    return os.path.relpath(start, path)'),
      [],
    ],
    [
      'an argument that matches a parameter whose slot is not given',
      code(
        'def build(name, docs, extra):',
        '    return name, docs, extra',
        '',
        '',
        'def run(docs):',
        '    return build(docs)',
      ),
      [],
    ],
    [
      'a starred call and a variadic callee',
      code(
        'def gather(docs, *rest):',
        '    return docs, rest',
        '',
        '',
        'def run(docs, rest, items):',
        '    gather(rest, docs)',
        '    gather(*items, docs)',
      ),
      [],
    ],
    [
      'a decorated callee',
      code(
        'import functools',
        '',
        '',
        '@functools.cache',
        'def pair(docs, proc):',
        '    return docs, proc',
        '',
        '',
        'def run(docs, proc):',
        '    return pair(proc, docs)',
      ),
      [],
    ],
  ]);
});
