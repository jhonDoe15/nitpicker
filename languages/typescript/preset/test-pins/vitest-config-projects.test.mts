import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVitest } from 'vitest/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fieldOf, fieldsOf, listOf } from '../../../../shared/values/readers.mts';

const packageRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const qualityConfig = path.join(
  packageRoot,
  'languages/typescript/preset/defaults/vitest.quality.config.ts',
);
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const passing = (name: string) => `import { it } from 'vitest';\nit('${name}', () => undefined);\n`;

const twoProjects = `export default { test: { projects: [
  { extends: true, test: { name: 'main', include: ['src/**/*.test.ts'], exclude: ['**/*.case.test.ts'] } },
  { extends: true, test: { name: 'dom', include: ['src/dom/**/*.test.ts'] } },
] } };`;

function writeFixture(root: string, name: string, text: string) {
  const file = path.join(root, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function setup(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-vitest-projects-'));
  temporaryRoots.push(root);
  symlinkSync(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'));
  for (const [name, text] of Object.entries(files)) {
    writeFixture(root, name, text);
  }
  return root;
}

async function ran(root: string) {
  vi.stubEnv('NITPICKER_POLICY', '');
  const vitest = await createVitest('test', {
    root,
    config: qualityConfig,
    watch: false,
    reporters: [],
    coverage: { enabled: false },
  });
  try {
    await vitest.start();
    return vitest.state
      .getTestModules()
      .map((module) =>
        `${module.project.name} ${path.relative(root, module.moduleId)} ${module.state()}`.trim(),
      )
      .sort();
  } finally {
    await vitest.close();
    vi.unstubAllEnvs();
  }
}

type Layered = (root: string) => Promise<unknown>;
const importLayered: (url: string) => Promise<{ layeredConfig: Layered }> = (url) => import(url);

async function resolvedTest(root: string) {
  const { layeredConfig } = await importLayered(`${qualityConfig}?${root}`);
  return fieldsOf(fieldOf(fieldsOf(await layeredConfig(root)), 'test'));
}

const nitpickerInclude = ['src', 'test', 'tests', '__tests__'].flatMap((root) => [
  `${root}/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`,
  `${root}/**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}`,
]);

const withoutCase = {
  'package.json': '{"type":"module"}\n',
  'vitest.config.mjs': twoProjects,
  'src/a.test.ts': passing('a'),
  'src/dom/b.test.ts': passing('b'),
};
const files = {
  ...withoutCase,
  'src/a.case.test.ts': 'throw new Error("a case file is not a test file");\n',
};

describe('the vitest config over a project config with test.projects', () => {
  it('leaves the include of the root and of each project alone', async () => {
    const test = await resolvedTest(setup(files));

    expect(fieldOf(test, 'include')).toBeUndefined();
    const projects = listOf(fieldOf(test, 'projects')).map((project) =>
      fieldsOf(fieldOf(project, 'test')),
    );
    expect(
      projects.map((project) => [
        fieldOf(project, 'name'),
        fieldOf(project, 'include'),
        fieldOf(project, 'exclude'),
      ]),
    ).toEqual([
      ['main', ['src/**/*.test.ts'], ['**/*.case.test.ts']],
      ['dom', ['src/dom/**/*.test.ts'], undefined],
    ]);
  });

  it('runs each file only in the projects whose own include matches it', async () => {
    expect(await ran(setup(files))).toEqual([
      'dom src/dom/b.test.ts passed',
      'main src/a.test.ts passed',
      'main src/dom/b.test.ts passed',
    ]);
  });

  it('keeps the include of glob and path projects', async () => {
    const modules = await ran(
      setup({
        ...files,
        'vitest.config.mjs': "export default { test: { projects: ['packages/*'] } };",
        'packages/one/vitest.config.mjs':
          "export default { test: { name: 'one', include: ['own/**/*.test.ts'] } };",
        'packages/one/own/c.test.ts': passing('c'),
        'packages/one/src/d.test.ts': 'throw new Error("outside the project include");\n',
      }),
    );

    expect(modules).toEqual(['one packages/one/own/c.test.ts passed']);
  });
});

describe('the vitest config over a project config without test.projects', () => {
  it('uses the nitpicker patterns when the project has no include of its own', async () => {
    const root = setup({ ...withoutCase, 'vitest.config.mjs': 'export default { test: {} };' });
    const test = await resolvedTest(root);

    expect(fieldOf(test, 'include')).toEqual(nitpickerInclude);
    expect(await ran(root)).toEqual(['src/a.test.ts passed', 'src/dom/b.test.ts passed']);
  });

  it('treats a legacy workspace key like projects', async () => {
    const root = setup({
      ...files,
      'vitest.config.mjs': "export default { test: { workspace: ['packages/*'] } };",
    });

    expect(fieldOf(await resolvedTest(root), 'include')).toBeUndefined();
  });

  it('keeps an empty include of the project as its own', async () => {
    const root = setup({
      ...files,
      'vitest.config.mjs': 'export default { test: { include: [] } };',
    });

    expect(fieldOf(await resolvedTest(root), 'include')).toEqual([]);
  });

  it('keeps the include of the project alone', async () => {
    const root = setup({
      ...withoutCase,
      'vitest.config.mjs': "export default { test: { include: ['src/dom/**/*.test.ts'] } };",
    });
    const test = await resolvedTest(root);

    expect(fieldOf(test, 'include')).toEqual(['src/dom/**/*.test.ts']);
    expect(await ran(root)).toEqual(['src/dom/b.test.ts passed']);
  });
});
