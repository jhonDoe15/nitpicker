import { describe, expect, it } from 'vitest';
import { goFacts } from '../facts/go-facts.mjs';
import { goTestRuntimeReport } from './go-test-runtime.mjs';

const MODULE = 'example.com/shop';

function file(path, extra = {}) {
  return {
    path,
    package: path.split('/').at(-2) ?? 'shop',
    test: path.endsWith('_test.go'),
    generated: false,
    constrained: false,
    ...extra,
  };
}

function definition(path, name) {
  return { file: path, name, kind: 'function', line: 3, lines: 3, exported: true, tokens: [] };
}

function usage(path, extra = {}) {
  return { file: path, imports: [], names: [], selectors: [], local: [], ...extra };
}

function test(path, name = 'TestIt') {
  return { file: path, name, start: 5, end: 9 };
}

const REPORT = {
  files: [
    file('price/price.go'),
    file('price/price_test.go'),
    file('price/api_test.go', { package: 'price_test' }),
    file('price/helpers_test.go'),
    file('price/helped_test.go'),
    file('price/alone_test.go'),
    file('price/e2e/flow_test.go'),
    file('price/main_test.go'),
  ],
  definitions: [
    definition('price/price.go', 'Total'),
    definition('price/helpers_test.go', 'expectTotal'),
    definition('price/alone_test.go', 'sum'),
  ],
  usages: [
    usage('price/price_test.go', { names: ['Total'] }),
    usage('price/api_test.go', {
      imports: [{ path: `${MODULE}/price`, name: '', line: 3 }],
      selectors: [{ qualifier: 'price', name: 'Total' }],
    }),
    usage('price/helpers_test.go', { names: ['Total'] }),
    usage('price/helped_test.go', { names: ['expectTotal'] }),
    usage('price/alone_test.go', { local: ['sum'] }),
    usage('price/e2e/flow_test.go'),
    usage('price/main_test.go', { local: ['TestMain'] }),
  ],
  tests: [
    test('price/price_test.go'),
    test('price/api_test.go'),
    test('price/helped_test.go'),
    test('price/alone_test.go'),
    test('price/e2e/flow_test.go'),
    test('price/main_test.go', 'TestMain'),
  ],
};

describe('Go test runtime', () => {
  const runtime = goTestRuntimeReport(goFacts(REPORT, { module: MODULE }), REPORT);
  const categoryOf = (path) => runtime.tests.find(({ test: name }) => name === path)?.category;

  it('reports a test file that reaches no production code, directly or through test helpers', () => {
    expect(runtime.findings.map(({ test: name }) => name)).toEqual(['price/alone_test.go']);
  });

  it('counts the package under test, an import of it and a same-package helper as production runtime', () => {
    expect(
      ['price/price_test.go', 'price/api_test.go', 'price/helped_test.go'].map(categoryOf),
    ).toEqual([
      'direct-production-runtime',
      'direct-production-runtime',
      'transitive-production-runtime',
    ]);
  });

  it('leaves end-to-end folders and helper-only test files out', () => {
    expect(runtime.exclusions).toEqual(['price/e2e/flow_test.go']);
    expect(categoryOf('price/helpers_test.go')).toBeUndefined();
  });
});
