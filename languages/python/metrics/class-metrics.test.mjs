import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listProductionModules, writeSourceListing } from '../adapters/analysis/python-sources.mjs';
import { pythonFileLimitFindings } from '../adapters/analysis/python-structure.mjs';
import { pythonClassLimitFindings } from '../adapters/size/python-size.mjs';
import { createMetrics, pythonUsable, script } from './python-helpers.mjs';

const { directory, cleanup } = createMetrics();

afterEach(cleanup);

function lines(count, line) {
  return Array.from({ length: count }, (_, index) => line(index)).join('');
}

function classFindings(files, sourceRoots = ['.']) {
  const root = directory();
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  const reportRoot = directory();
  const project = { sourceRoots };
  const { listing } = writeSourceListing({ projectRoot: root, reportRoot, project });
  const output = [path.join(reportRoot, 's.json'), root, listing, path.join(reportRoot, 'c.json')];
  const result = spawnSync('python3', [script, ...output], { encoding: 'utf8' });
  expect(result.stderr).toBe('');
  const report = JSON.parse(readFileSync(path.join(reportRoot, 'c.json'), 'utf8'));
  const modules = listProductionModules(root, sourceRoots);
  return {
    root,
    messages: pythonClassLimitFindings(report, modules, { thresholds: {} }).map(
      ({ path: file, message }) => `${file}: ${message.split(' (')[0]}`,
    ),
  };
}

const ATTRIBUTES = lines(11, (index) => `    attr_${String(index)}: int\n`);

describe.skipIf(!pythonUsable())('the class limits of the structure metrics script', () => {
  it('counts no fields on a Protocol or an abstract interface, as Java skips interfaces', () => {
    const { messages } = classFindings({
      'app/__init__.py': '',
      'app/ports.py': `from abc import ABC, abstractmethod\nfrom typing import Protocol\n\n\nclass Settings(Protocol):\n${ATTRIBUTES}\n\nclass Port(ABC):\n${ATTRIBUTES}\n    @abstractmethod\n    def read(self): ...\n\n\nclass Base(ABC):\n${ATTRIBUTES}\n    def read(self):\n        return 1\n`,
    });

    expect(messages).toEqual(['app/ports.py: Class Base has 11 fields']);
  });
  it('words data classes, TypedDicts and NamedTuples as records', () => {
    const { messages } = classFindings({
      'app/__init__.py': '',
      'app/models.py': `from dataclasses import dataclass\nfrom typing import NamedTuple, TypedDict\n\n\n@dataclass(frozen=True)\nclass Order:\n${ATTRIBUTES}\n\nclass Payload(TypedDict):\n${ATTRIBUTES}\n\nclass Point(NamedTuple):\n${ATTRIBUTES}`,
    });

    expect(messages).toEqual([
      'app/models.py: Record Order has 11 components',
      'app/models.py: Record Payload has 11 components',
      'app/models.py: Record Point has 11 components',
    ]);
  });
  it('counts no overload stub as a method and a nested class field only on the nested class', () => {
    const overloads = lines(
      7,
      (index) =>
        `    @overload\n    def get${String(index)}(self, k: int) -> int: ...\n    @overload\n    def get${String(index)}(self, k: str) -> str: ...\n    def get${String(index)}(self, k):\n        return k\n`,
    );
    const assignments = lines(11, (index) => `                self.f${String(index)} = 1\n`);
    const { messages } = classFindings({
      'app/__init__.py': '',
      'app/repo.py': `from typing import overload\n\n\nclass Repo:\n${overloads}`,
      'app/factory.py': `class Factory:\n    def build(self):\n        class Product:\n            def __init__(self):\n${assignments}        return Product\n`,
    });

    expect(messages).toEqual(['app/factory.py: Class Factory.build.Product has 11 fields']);
  });
  it('counts project base classes only, not an external base or a Protocol extending another', () => {
    const { messages } = classFindings({
      'app/__init__.py': '',
      'app/errors.py':
        'class AppError(Exception):\n    pass\n\n\nclass DomainError(AppError):\n    pass\n\n\nclass NotFoundError(DomainError):\n    pass\n\n\nclass UserNotFoundError(NotFoundError):\n    pass\n',
      'app/ports.py':
        'from typing import Protocol\n\n\nclass Readable(Protocol):\n    def read(self) -> bytes: ...\n\n\nclass ReadWrite(Readable, Protocol):\n    def write(self) -> None: ...\n\n\nclass Store(ReadWrite, Protocol):\n    def delete(self) -> None: ...\n\n\nclass Cache(Store, Protocol):\n    def expire(self) -> None: ...\n',
      'app/cache.py':
        'from app.ports import Cache\n\n\nclass MemoryCache(Cache):\n    def read(self) -> bytes:\n        return b""\n',
    });

    expect(messages).toEqual([]);
  });
  it('leaves generated stubs and Django tests.py out of the size limits', () => {
    const rpcs = lines(
      11,
      (index) => `        self.Call${String(index)} = channel.unary_unary("/x")\n`,
    );
    const methods = lines(21, (index) => `    def test_${String(index)}(self):\n        pass\n`);
    const files = {
      'app/__init__.py': '',
      'app/proto/__init__.py': '',
      'app/proto/orders_pb2_grpc.py': `import grpc\n\n\nclass OrdersStub(object):\n    def __init__(self, channel):\n${rpcs}`,
      'app/proto/marked.py': `# Generated by a code generator. DO NOT EDIT!\n\n\nclass Marked:\n    def __init__(self, channel):\n${rpcs}`,
      'manage.py': '',
      'polls/__init__.py': '',
      'polls/tests.py': `from django.test import TestCase\n\n\nclass QuestionTests(TestCase):\n${methods}`,
      'polls/forms.py': 'X = 1\n',
      'polls/models.py': 'X = 1\n',
      'polls/views.py': 'X = 1\n',
      'polls/urls.py': 'X = 1\n',
      'polls/admin.py': 'X = 1\n',
      'polls/apps.py': 'X = 1\n',
    };
    const { root, messages } = classFindings(files);

    expect(messages).toEqual([]);
    expect(
      pythonFileLimitFindings(root, { fileLimits: {} }).map(({ rule, path: file }) => [rule, file]),
    ).toEqual([]);
  });
});
