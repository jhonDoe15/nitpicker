import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLayout } from '../layout.mjs';
import { analyzeCoupling } from './analyze.mjs';
import { sharedUsedByOneFeature } from './shared-usage.mjs';

const module = (source, ...targets) => ({
  source,
  dependencies: targets.map((resolved) => ({ resolved, dependencyTypes: ['local'] })),
});

function usage(modules, { sourceRoot = 'src', layout = resolveLayout(), analyze } = {}) {
  const sharedUsage = analyze ?? sharedUsedByOneFeature;
  return sharedUsage({ modules }, { sourceRoot, isProduction: layout.isSourceFile }).map(
    ({ source, feature, directory }) => [source, feature, directory],
  );
}

async function analyzerForRoots(sourceRoots) {
  const directory = mkdtempSync(path.join(tmpdir(), 'shared-usage-'));
  const policyFile = path.join(directory, 'policy.json');
  writeFileSync(policyFile, JSON.stringify({ layout: { sourceRoots } }));
  vi.stubEnv('NITPICKER_POLICY', policyFile);
  vi.resetModules();
  try {
    return (await import('./shared-usage.mjs')).sharedUsedByOneFeature;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('shared modules used by one feature', () => {
  it('reports a shared module that only one feature imports', () => {
    expect(
      usage([
        module('src/main/features/billing/index.ts', 'src/main/shared/format-price.ts'),
        module('src/main/features/billing/domain/totals.ts', 'src/main/shared/format-price.ts'),
        module('src/main/shared/format-price.ts'),
      ]),
    ).toEqual([['src/main/shared/format-price.ts', 'billing', 'src/main/features/billing/']]);
  });

  it('leaves a shared module that two features import', () => {
    expect(
      usage([
        module('src/main/features/billing/index.ts', 'src/main/shared/money.ts'),
        module('src/main/features/orders/index.ts', 'src/main/shared/money.ts'),
        module('src/main/shared/money.ts'),
      ]),
    ).toEqual([]);
  });

  it('follows chains of shared modules: a leaf reached by two features through two helpers', () => {
    const modules = [
      module('src/main/features/billing/index.ts', 'src/main/shared/a.ts'),
      module('src/main/features/orders/index.ts', 'src/main/shared/b.ts'),
      module('src/main/shared/a.ts', 'src/main/shared/leaf.ts'),
      module('src/main/shared/b.ts', 'src/main/shared/leaf.ts'),
      module('src/main/shared/leaf.ts'),
    ];

    expect(usage(modules)).toEqual([
      ['src/main/shared/a.ts', 'billing', 'src/main/features/billing/'],
      ['src/main/shared/b.ts', 'orders', 'src/main/features/orders/'],
    ]);
  });

  it('reports every shared module of a chain that only one feature reaches', () => {
    expect(
      usage([
        module('src/main/features/billing/index.ts', 'src/main/shared/helper.ts'),
        module('src/main/shared/helper.ts', 'src/main/shared/leaf.ts'),
        module('src/main/shared/leaf.ts', 'src/main/shared/helper.ts'),
      ]).map(([source]) => source),
    ).toEqual(['src/main/shared/helper.ts', 'src/main/shared/leaf.ts']);
  });

  it('counts the composition root and other production modules as consumers', () => {
    expect(
      usage([
        module(
          'src/main/features/billing/index.ts',
          'src/main/shared/clock.ts',
          'src/main/shared/ids.ts',
        ),
        module('src/main/composition-root.ts', 'src/main/shared/clock.ts'),
        module('src/main/main.ts', 'src/main/shared/ids.ts'),
        module('src/main/shared/clock.ts'),
        module('src/main/shared/ids.ts'),
      ]),
    ).toEqual([]);
  });

  it('does not count test files as consumers', () => {
    expect(
      usage([
        module('src/main/features/billing/index.ts', 'src/main/shared/format.ts'),
        module('src/main/features/orders/index.test.ts', 'src/main/shared/format.ts'),
        module('src/main/shared/__tests__/format.ts', 'src/main/shared/format.ts'),
        module('test/format.test.ts', 'src/main/shared/format.ts'),
        module('src/main/shared/format.ts'),
      ]),
    ).toEqual([['src/main/shared/format.ts', 'billing', 'src/main/features/billing/']]);
  });

  it('does not count or report stories, mocks and fixtures', () => {
    const modules = [
      module(
        'src/main/features/billing/index.ts',
        'src/main/shared/format.ts',
        'src/main/shared/__mocks__/clock.ts',
      ),
      module('src/main/features/orders/card.stories.tsx', 'src/main/shared/format.ts'),
      module('src/main/features/orders/__mocks__/api.ts', 'src/main/shared/format.ts'),
      module('src/main/features/orders/__fixtures__/data.ts', 'src/main/shared/format.ts'),
      module('src/main/features/orders/fixtures/data.ts', 'src/main/shared/format.ts'),
      module('src/main/features/orders/stories/card.tsx', 'src/main/shared/format.ts'),
      module('src/main/shared/__mocks__/clock.ts'),
      module('src/main/shared/format.ts'),
    ];

    expect(analyzeCoupling({ modules }, 'src').sharedUsedByOneFeature).toEqual([
      {
        source: 'src/main/shared/format.ts',
        feature: 'billing',
        directory: 'src/main/features/billing/',
      },
    ]);
  });

  it('maps an import that resolves into the checkout node_modules links to, as a workspace package does', () => {
    const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'shared-usage-workspace-')));
    mkdirSync(path.join(base, 'live/node_modules'), { recursive: true });
    mkdirSync(path.join(base, 'snapshot'));
    symlinkSync(path.join(base, 'live/node_modules'), path.join(base, 'snapshot/node_modules'));
    const modules = [
      module('src/main/features/billing/index.ts', 'src/main/shared/clock.ts'),
      module('src/main/main.ts', '../live/src/main/shared/clock.ts'),
      module('src/main/shared/clock.ts'),
    ];
    try {
      expect(
        analyzeCoupling({ modules }, 'src', { projectRoot: path.join(base, 'snapshot') })
          .sharedUsedByOneFeature,
      ).toEqual([]);
      expect(analyzeCoupling({ modules }, 'src').sharedUsedByOneFeature).toHaveLength(1);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('leaves a shared module no feature reaches to the dead-code check', () => {
    expect(
      usage([
        module('src/main/shared/unused.ts'),
        module('src/main/shared/other.ts', 'src/main/shared/unused.ts'),
      ]),
    ).toEqual([]);
  });

  it('leaves a shared module that a module of another source root imports', async () => {
    const analyze = await analyzerForRoots(['core', 'tools']);
    const layout = resolveLayout({ sourceRoots: ['core', 'tools'] });

    expect(
      usage(
        [
          module('core/main/features/billing/index.ts', 'core/main/shared/format.ts'),
          module('tools/script.ts', 'core/main/shared/format.ts'),
          module('core/main/shared/format.ts'),
        ],
        { sourceRoot: 'core', layout, analyze },
      ),
    ).toEqual([]);
  });

  it('counts a feature of another source root as a different feature', async () => {
    const analyze = await analyzerForRoots(['core', 'tools']);
    const layout = resolveLayout({ sourceRoots: ['core', 'tools'] });
    const modules = [
      module('core/main/features/billing/index.ts', 'core/main/shared/format.ts'),
      module('tools/main/features/billing/index.ts', 'core/main/shared/format.ts'),
      module('core/main/shared/format.ts'),
      module('tools/main/shared/own.ts'),
      module('tools/main/features/billing/own.ts', 'tools/main/shared/own.ts'),
    ];

    expect(usage(modules, { sourceRoot: 'core', layout, analyze })).toEqual([]);
    expect(usage(modules, { sourceRoot: 'tools', layout, analyze })).toEqual([
      ['tools/main/shared/own.ts', 'billing', 'tools/main/features/billing/'],
    ]);
  });

  it('works under a custom source root and ignores files outside main/shared', async () => {
    const analyze = await analyzerForRoots(['app']);
    const layout = resolveLayout({ sourceRoots: ['app'] });

    expect(
      usage(
        [
          module(
            'app/main/features/billing/index.ts',
            'app/main/shared/format.ts',
            'app/main/other.ts',
          ),
          module('app/main/features/billing.ts', 'app/main/other.ts'),
          module('app/main/shared/format.ts'),
          module('app/main/other.ts'),
        ],
        { sourceRoot: 'app', layout, analyze },
      ),
    ).toEqual([['app/main/shared/format.ts', 'billing', 'app/main/features/billing/']]);
  });
});
