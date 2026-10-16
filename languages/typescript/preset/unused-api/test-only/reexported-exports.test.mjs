import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayoutFor } from '../../layout.mjs';
import { createProject, removeProject } from '../test-support/project.mjs';
import { loadPackages } from '../workspace/packages.mjs';
import { reexportedTestOnlyEntries } from './reexported-exports.mjs';

const CORE = '../../core/src/pricing';
const PROJECT = {
  'package.json': { name: 'repo', private: true, workspaces: ['packages/*'] },
  'packages/core/package.json': { name: '@scope/core', private: true },
  'packages/core/src/pricing.ts': `export const applyDiscount = 1;
export const tallyCart = 2;
export const weighBox = 3;
export const sortShelf = 4;
export const pruneVine = 5;
export const trimHedge = 6;
export const wiltPetal = 7;
`,
  'packages/core/src/use.ts':
    "import { wiltPetal } from './pricing';\nexport const use = wiltPetal;\n",
  'packages/lib/package.json': {
    name: '@scope/lib',
    types: 'dist/index.d.ts',
    exports: { '.': './src/index.ts', './extra': { import: './src/extra.ts' } },
  },
  'packages/lib/src/index.ts': `export { applyDiscount } from '${CORE}';\n`,
  'packages/lib/src/extra.ts': `export { weighBox } from '${CORE}';\n`,
  'packages/lib/src/tools.ts': `export { sortShelf } from '${CORE}';\n`,
  'packages/shell/package.json': { name: '@scope/shell', private: true, main: 'src/index.ts' },
  'packages/shell/src/index.ts': `import { pruneVine, trimHedge, wiltPetal } from '${CORE}';
export { tallyCart } from '${CORE}';
export { pruneVine, trimHedge, wiltPetal };
`,
  'tests/prune.test.ts': `import { pruneVine } from '../packages/core/src/pricing';
export const check = pruneVine;
`,
};
const EXPORTED = ['applyDiscount', 'tallyCart', 'weighBox', 'sortShelf'];
const SHELL = 'packages/shell/src/index.ts';
let root;

function report(entries) {
  const byFile = Map.groupBy(entries, ([file]) => file);
  return {
    issues: [...byFile].map(([file, items]) => ({
      file,
      exports: items.map(([, name]) => ({ name })),
    })),
  };
}

function testOnly({ entryPoints = [] } = {}) {
  root = createProject(PROJECT, { manifest: PROJECT['package.json'] });
  const layout = {
    ...resolveLayoutFor({
      layout: { sourceRoots: ['packages/core/src', 'packages/lib/src', 'packages/shell/src'] },
    }),
    entryPoints,
  };
  const revealed = [
    ...EXPORTED.map((name) => ['packages/core/src/pricing.ts', name]),
    ['packages/lib/src/index.ts', 'applyDiscount'],
    [SHELL, 'tallyCart'],
    [SHELL, 'pruneVine'],
    [SHELL, 'trimHedge'],
    [SHELL, 'wiltPetal'],
  ];
  const runs = {
    production: () => report(revealed),
    normal: () => report([[SHELL, 'trimHedge']]),
  };
  const packagesInfo = loadPackages(root, layout);
  return reexportedTestOnlyEntries({
    production: { issues: [] },
    runs,
    packagesInfo,
    layout,
    projectRoot: root,
  }).map(({ file, entry }) => `${file} ${entry.name}`);
}

afterEach(() => {
  removeProject(root);
});

describe('exports kept alive by a re-export from an entry', () => {
  it('leaves what the manifest entries of a published package re-export alone, subpaths included', () => {
    expect(testOnly()).toEqual([
      'packages/core/src/pricing.ts tallyCart',
      'packages/core/src/pricing.ts sortShelf',
      'packages/core/src/pricing.ts pruneVine',
    ]);
  });

  it('leaves what a layout entry point of a published package re-exports alone', () => {
    expect(testOnly({ entryPoints: ['packages/lib/src/tools.ts'] })).toEqual([
      'packages/core/src/pricing.ts tallyCart',
      'packages/core/src/pricing.ts pruneVine',
    ]);
  });

  it('follows an import that is only exported again, unless something else uses it', () => {
    const followed = testOnly().filter((item) => /(?:pruneVine|trimHedge|wiltPetal)$/u.test(item));

    expect(followed).toEqual(['packages/core/src/pricing.ts pruneVine']);
  });
});
