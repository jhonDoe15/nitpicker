import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runDeadCode } from '../../../adapters/quality-areas/runners/repository.mjs';
import { createProject } from '../test-support/project.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../../..');
const EXCEPTION = (file) =>
  `If this is intended, add {"rule":"test-only-export","paths":["${file}"],"reason":"..."} ` +
  'to "exceptions" in nitpicker.config.json.';
const ONLY_TESTS_FINDING = {
  tool: 'dead-code',
  rule: 'test-only-export',
  path: 'src/main/shared.ts',
  identity: 'exports:onlyTests',
  symbol: 'onlyTests',
  classification: 'enforceable',
  location: { line: 2 },
  message: `Export onlyTests is only imported by tests. Remove \`export\`, or import it from production code. ${EXCEPTION('src/main/shared.ts')}`,
};
const BUILDERS_FINDING = {
  tool: 'dead-code',
  rule: 'test-only-export',
  path: 'src/main/builders.ts',
  identity: 'files:src/main/builders.ts',
  symbol: 'src/main/builders.ts',
  classification: 'enforceable',
  message: `Module src/main/builders.ts is only imported by tests. Move it to a test-support/ folder, or import it from production code. ${EXCEPTION('src/main/builders.ts')}`,
};
const PRIVATE_APP = {
  name: 'app',
  private: true,
  scripts: { seed: 'tsx scripts/seed.ts', build: 'vite build' },
  devDependencies: { vitest: '4.1.11', vite: '7.0.0', tsx: '4.0.0' },
};

const SOURCES = {
  'src/main/main.ts': `import { shared } from './shared';
import { colocated } from './colocated';
console.log(shared(), colocated());
`,
  'src/main/shared.ts': `export function shared() { return 1; }
export function onlyTests() { return 2; }
export function nobody() { return 3; }
export type OnlyTestsType = { a: 1 };
export const fromScript = 4;
export const fromViteConfig = 5;
`,
  'src/main/colocated.ts':
    'export function colocated() { return 4; }\nexport function colocatedTestOnly() { return 5; }\n',
  'src/main/builders.ts': 'export function build() { return 7; }\n',
  'src/main/shared.test.ts': `import { it } from 'vitest';
import { onlyTests } from './shared';
import type { OnlyTestsType } from './shared';
import { colocatedTestOnly } from './colocated';
import { build } from './builders';
const value: OnlyTestsType = { a: 1 };
it('uses them', () => { onlyTests(); colocatedTestOnly(); build(); return value; });
`,
  'src/main/test-support/helper.ts': 'export function helper() { return 6; }\n',
  'test/helper.test.ts': `import { it } from 'vitest';
import { helper } from '../src/main/test-support/helper';
it('uses the helper', () => helper());
`,
  'scripts/seed.ts': "import { fromScript } from '../src/main/shared';\nconsole.log(fromScript);\n",
  'vite.config.ts': `import { fromViteConfig } from './src/main/shared';
export default { define: { value: fromViteConfig } };
`,
};

let directories = [];

function deadCode({ sources = SOURCES, manifest = PRIVATE_APP, policy = {} } = {}) {
  const root = createProject(sources, { manifest });
  const policyDirectory = mkdtempSync(path.join(tmpdir(), 'nitpicker-policy-'));
  directories.push(root, policyDirectory);
  const policyFile = path.join(policyDirectory, 'policy.json');
  const fullPolicy = {
    exclude: [],
    layout: { sourceRoots: ['src/main'] },
    exceptions: [],
    thresholds: {},
  };
  writeFileSync(policyFile, JSON.stringify({ ...fullPolicy, ...policy }));
  vi.stubEnv('NITPICKER_POLICY', policyFile);
  try {
    return runDeadCode({
      projectRoot: root,
      policyRoot: packageRoot,
      liveProjectRoot: packageRoot,
      analyzerName: 'dead-code',
      kind: 'dead-code',
    }).filter(({ rule }) => rule === 'test-only-export');
  } finally {
    vi.unstubAllEnvs();
  }
}

function symbols(findings) {
  return findings.map(({ path: file, symbol }) => `${file} ${symbol}`).toSorted();
}

const REEXPORTS = {
  'src/main/main.ts': `import { stampLabel } from './features/labels/stamp';
import { dyeCloth } from './features/cloth/dye';
export { applyDiscount } from './features/pricing/discount';
export { glazeTile } from './features/tiles/barrel';
export { sealJar } from './features/jars/lid';
export { dyeCloth };
export * from './features/shelves/shelf';
export { weighCrate } from './features/crates';
console.log(stampLabel());
`,
  'src/main/features/pricing/discount.ts': 'export function applyDiscount() { return 1; }\n',
  'src/main/features/cloth/dye.ts': 'export function dyeCloth() { return 6; }\n',
  'src/main/features/tiles/barrel.ts': "export { glazeTile } from './glaze';\n",
  'src/main/features/tiles/glaze.ts': 'export function glazeTile() { return 2; }\n',
  'src/main/features/jars/lid.ts': 'export function sealJar() { return 3; }\n',
  'src/main/features/shelves/shelf.ts': 'export function stackShelf() { return 4; }\n',
  'src/main/features/crates/index.ts': "export { weighCrate } from './weigh';\n",
  'src/main/features/crates/weigh.ts': 'export function weighCrate() { return 5; }\n',
  'src/main/features/labels/stamp.ts': `import { weighCrate } from '../crates';
export function stampLabel() { return weighCrate(); }
`,
  'src/main/features/reexports.test.ts': `import { it } from 'vitest';
import { applyDiscount } from './pricing/discount';
import { glazeTile } from './tiles/glaze';
import { stackShelf } from './shelves/shelf';
import { weighCrate } from './crates/weigh';
import { dyeCloth } from './cloth/dye';
it('uses them', () => { applyDiscount(); glazeTile(); stackShelf(); weighCrate(); dyeCloth(); });
`,
  'src/main/features/jars/jars.test.ts': `import { it } from 'vitest';
import { sealJar } from '../../main';
it('seals', () => sealJar());
`,
};

let privateFindings;

beforeAll(() => {
  privateFindings = deadCode();
});

afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories = [];
});

describe('exports and modules only tests import', () => {
  it('reports what the run without tests drops and the normal run keeps, in a private package', () => {
    expect(symbols(privateFindings)).toEqual([
      'src/main/builders.ts src/main/builders.ts',
      'src/main/colocated.ts colocatedTestOnly',
      'src/main/shared.ts OnlyTestsType',
      'src/main/shared.ts onlyTests',
    ]);
  });

  it('names the export or the module and the exception that would lift the finding', () => {
    expect(
      privateFindings.filter(({ symbol }) =>
        ['onlyTests', 'src/main/builders.ts'].includes(symbol),
      ),
    ).toEqual(
      [BUILDERS_FINDING, ONLY_TESTS_FINDING].toSorted((left, right) =>
        left.path.localeCompare(right.path),
      ),
    );
  });

  it('does not judge a published package, whose own tests count as callers', () => {
    const manifest = { ...PRIVATE_APP, name: 'library', private: false, main: 'src/main/main.ts' };

    expect(deadCode({ manifest })).toEqual([]);
  });

  it('honours an exception for the rule', () => {
    const exceptions = [
      { rule: 'test-only-export', paths: ['src/main/shared.ts'], reason: 'kept' },
    ];

    expect(symbols(deadCode({ policy: { exceptions } }))).toEqual([
      'src/main/builders.ts src/main/builders.ts',
      'src/main/colocated.ts colocatedTestOnly',
    ]);
  });
});

describe('exports that an entry re-exports', () => {
  let reexportFindings;

  function inFolder(folder) {
    return reexportFindings.filter((finding) => finding.includes(`/features/${folder}/`));
  }

  beforeAll(() => {
    reexportFindings = symbols(deadCode({ sources: REEXPORTS }));
  });

  it('does not count a re-export from the entry of a private app as a use', () => {
    expect(inFolder('pricing')).toEqual(['src/main/features/pricing/discount.ts applyDiscount']);
  });

  it('follows a barrel chain to the declaration', () => {
    expect(inFolder('tiles')).toEqual(['src/main/features/tiles/glaze.ts glazeTile']);
  });

  it('does not count `export *` or an import that is exported again', () => {
    expect(inFolder('shelves')).toEqual(['src/main/features/shelves/shelf.ts stackShelf']);
    expect(inFolder('cloth')).toEqual(['src/main/features/cloth/dye.ts dyeCloth']);
  });

  it('does not count another test that imports it from the entry', () => {
    expect(inFolder('jars')).toEqual(['src/main/features/jars/lid.ts sealJar']);
  });

  it('leaves out a barrel re-export that production code imports onward, and nothing else', () => {
    expect(inFolder('crates')).toEqual([]);
    expect(inFolder('labels')).toEqual([]);
    expect(reexportFindings).toHaveLength(5);
  });

  it('counts the re-export of a published package, whose entry is public', () => {
    const manifest = {
      ...PRIVATE_APP,
      name: 'library',
      private: false,
      exports: './src/main/main.ts',
    };

    expect(deadCode({ sources: REEXPORTS, manifest })).toEqual([]);
  });
});
