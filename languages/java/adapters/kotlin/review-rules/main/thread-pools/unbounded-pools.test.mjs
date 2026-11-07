import { describe, expect, it } from 'vitest';
import { findingFactory } from '../../review-finding.mjs';
import { unboundedPoolFindings } from './unbounded-pools.mjs';

function source(invocations, { imports = [], test = false } = {}) {
  return {
    file: 'src/main/kotlin/shop/Pools.kt',
    test,
    package: 'shop',
    imports: imports.map((path) =>
      path.endsWith('.*') ? { path: path.slice(0, -2), all: true } : { path, all: false },
    ),
    scopes: [
      { id: 0, k: 'class', name: 'Pools', qualified: 'Pools' },
      { id: 1, parent: 0, k: 'fun', name: 'start', line: 3 },
    ],
    invocations: invocations.map((invocation, index) => ({
      line: index + 4,
      scope: 1,
      arguments: [],
      ...invocation,
    })),
  };
}

function lines(file) {
  return unboundedPoolFindings([file], { finding: findingFactory() }).map(
    ({ location, rule, symbol }) => `${String(location.line)} ${rule} ${symbol}`,
  );
}

const MAX = [{ text: '0' }, { text: 'Int.MAX_VALUE' }, { text: '60' }];

describe('UnboundedThreadPool on Kotlin sources', () => {
  it('reports a cached pool and a ThreadPoolExecutor with no maximum size', () => {
    const file = source(
      [
        { name: 'newCachedThreadPool', receiver: 'Executors' },
        { name: 'newCachedThreadPool', receiver: 'java.util.concurrent.Executors' },
        { name: 'ThreadPoolExecutor', arguments: MAX },
        { name: 'newCachedThreadPool' },
      ],
      {
        imports: [
          'java.util.concurrent.Executors',
          'java.util.concurrent.ThreadPoolExecutor',
          'java.util.concurrent.Executors.newCachedThreadPool',
        ],
      },
    );

    expect(lines(file)).toEqual([
      '4 UnboundedThreadPool Pools.start.newCachedThreadPool',
      '5 UnboundedThreadPool Pools.start.newCachedThreadPool',
      '6 UnboundedThreadPool Pools.start.ThreadPoolExecutor',
      '7 UnboundedThreadPool Pools.start.newCachedThreadPool',
    ]);
  });

  it('resolves star imports and leaves bounded pools, other types and tests alone', () => {
    const bounded = [
      { name: 'newFixedThreadPool', receiver: 'Executors' },
      { name: 'ThreadPoolExecutor', arguments: [{ text: '1' }, { text: '4' }] },
      { name: 'newCachedThreadPool', receiver: 'Pools' },
      { name: 'newCachedThreadPool' },
      { name: 'newCachedThreadPool', receiver: 'Executors' },
    ];

    expect(lines(source(bounded, { imports: ['java.util.concurrent.*'] }))).toEqual([
      '8 UnboundedThreadPool Pools.start.newCachedThreadPool',
    ]);
    expect(lines(source(bounded.slice(0, 4), { imports: ['java.util.concurrent.*'] }))).toEqual([]);
    expect(lines(source(bounded))).toEqual([]);
    expect(
      lines(source([{ name: 'newCachedThreadPool', receiver: 'Executors' }], { test: true })),
    ).toEqual([]);
  });
});
