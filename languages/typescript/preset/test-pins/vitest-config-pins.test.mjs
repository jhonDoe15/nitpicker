import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import qualityConfig from '../defaults/vitest.quality.config.ts';

const temporaryRoots = [];
const looseProjectTest = `{
  retry: 2,
  allowOnly: true,
  passWithNoTests: true,
  bail: 1,
  testTimeout: 120000,
  hookTimeout: 120000,
  update: true,
  dangerouslyIgnoreUnhandledErrors: true,
  testNamePattern: 'only this',
  environment: 'jsdom',
}`;

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

async function resolvedConfig(projectFiles) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-vitest-pins-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(projectFiles)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await Promise.resolve(qualityConfig({ command: 'serve', mode: 'test' }));
  } finally {
    process.chdir(previous);
  }
}

const packageRoot = fileURLToPath(new URL('../../../..', import.meta.url));

function runQualityTests(projectFiles) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-vitest-run-'));
  temporaryRoots.push(root);
  symlinkSync(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'));
  for (const [name, text] of Object.entries(projectFiles)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  const config = path.join(
    packageRoot,
    'languages/typescript/preset/defaults/vitest.quality.config.ts',
  );
  const vitest = path.join(packageRoot, 'node_modules/vitest/vitest.mjs');
  const report = path.join(root, 'test-results.json');
  const result = spawnSync(
    process.execPath,
    [
      vitest,
      'run',
      '--config',
      config,
      '--root',
      root,
      '--reporter=json',
      `--outputFile=${report}`,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NITPICKER_POLICY: '' },
      timeout: 30_000,
    },
  );
  return {
    ...result,
    report: result.status === 0 ? JSON.parse(readFileSync(report, 'utf8')) : undefined,
  };
}

function pick(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

const pinnedGlobal = {
  bail: 0,
  passWithNoTests: false,
  dangerouslyIgnoreUnhandledErrors: false,
  testNamePattern: undefined,
  update: 'none',
};
const pinnedPerProject = {
  retry: 0,
  allowOnly: false,
  restoreMocks: true,
  testTimeout: 10_000,
  hookTimeout: 10_000,
};
const longerTimeouts = { testTimeout: 120_000, hookTimeout: 120_000 };

describe('the vitest config nitpicker runs tests with', () => {
  it('pins every option that changes pass or fail over a project config', async () => {
    const config = await resolvedConfig({
      'vitest.config.mjs': `export default { test: ${looseProjectTest} };`,
    });

    expect(
      pick(config.test, [...Object.keys(pinnedGlobal), ...Object.keys(pinnedPerProject)]),
    ).toEqual({
      ...pinnedGlobal,
      ...pinnedPerProject,
      ...longerTimeouts,
    });
    expect(config.test.environment).toBe('jsdom');
  });

  it('pins the options of inline projects in a project config and keeps their other settings', async () => {
    const config = await resolvedConfig({
      'vitest.config.mjs': `export default { test: { projects: [
        { test: { name: 'ui', ...${looseProjectTest} } },
      ] } };`,
    });

    const [ui] = config.test.projects;
    expect(pick(ui.test, ['name', 'environment', ...Object.keys(pinnedPerProject)])).toEqual({
      name: 'ui',
      environment: 'jsdom',
      ...pinnedPerProject,
      ...longerTimeouts,
    });
    expect(ui.plugins.map(({ name }) => name)).toEqual(['nitpicker-strip-coverage-ignore-hints']);
  });

  it('turns project paths and globs into pinned projects that extend their own config', async () => {
    const config = await resolvedConfig({
      'vitest.config.mjs': `export default { test: { projects: [
        './packages/api',
        'packages/*',
        '!packages/skipped',
        'tools/vitest.e2e.config.mjs',
      ] } };`,
      'packages/api/vitest.config.ts': 'export default { test: { retry: 3, testTimeout: 60000 } };',
      'packages/web/package.json': '{}',
      'packages/skipped/vitest.config.ts': 'export default {};',
      'tools/vitest.e2e.config.mjs': 'export default {};',
    });
    const root = temporaryRoots.at(-1);

    const projects = await Promise.all(config.test.projects);

    expect(
      projects.map((project) => ({
        extends: project.extends,
        root: project.root,
        test: project.test,
        plugins: project.plugins.map(({ name }) => name),
      })),
    ).toEqual(
      [
        {
          extends: path.join(root, 'packages/api/vitest.config.ts'),
          root: path.join(root, 'packages/api'),
          test: { ...pinnedPerProject, testTimeout: 60_000 },
        },
        { extends: undefined, root: path.join(root, 'packages/web'), test: pinnedPerProject },
        {
          extends: path.join(root, 'tools/vitest.e2e.config.mjs'),
          root: path.join(root, 'tools'),
          test: pinnedPerProject,
        },
      ].map((project) => ({ ...project, plugins: ['nitpicker-strip-coverage-ignore-hints'] })),
    );
  });

  it('raises shorter timeouts and keeps the stub and env settings of the project', async () => {
    const config = await resolvedConfig({
      'vitest.config.mjs': `export default { test: { testTimeout: 2000, hookTimeout: 30000, unstubGlobals: false } };`,
    });

    expect(
      pick(config.test, ['testTimeout', 'hookTimeout', 'unstubGlobals', 'unstubEnvs']),
    ).toEqual({
      testTimeout: 10_000,
      hookTimeout: 30_000,
      unstubGlobals: false,
      unstubEnvs: undefined,
    });
  });

  it('pins projects a config returns from a function or a promise', async () => {
    const config = await resolvedConfig({
      'vitest.config.mjs': `export default { test: { projects: [
        () => ({ test: { name: 'lazy', retry: 2 } }),
        Promise.resolve({ test: { name: 'later', retry: 2 } }),
      ] } };`,
    });
    const [lazy, later] = config.test.projects;

    expect([(await lazy({})).test, (await later).test]).toEqual([
      { name: 'lazy', ...pinnedPerProject },
      { name: 'later', ...pinnedPerProject },
    ]);
  });

  it('pins the same options when the project has no vitest config', async () => {
    const config = await resolvedConfig({});

    expect(pick(config.test, Object.keys(pinnedGlobal))).toEqual(pinnedGlobal);
    expect(
      config.test.projects.map(({ test }) => pick(test, Object.keys(pinnedPerProject))),
    ).toEqual([pinnedPerProject, pinnedPerProject]);
  });

  it('strips coverage ignore hints from sources and keeps line positions', async () => {
    const config = await resolvedConfig({});
    const [strip] = config.plugins;
    const code = [
      '/* v8 ignore next 2 */',
      'if (x) { run(); }',
      'run(); // istanbul ignore next',
      '/*c8 ignore start*/ run(); /* c8 ignore stop */',
      'const text = "no hint here";',
    ].join('\n');

    const result = strip.transform(code, '/project/src/a.ts');

    expect(result.code.split('\n').map((line) => line.trim())).toEqual([
      '',
      'if (x) { run(); }',
      'run();',
      'run();',
      'const text = "no hint here";',
    ]);
    expect(result.code).toHaveLength(code.length);
  });

  it('leaves code without hints and dependencies alone', async () => {
    const config = await resolvedConfig({});
    const [strip] = config.plugins;

    expect(strip.transform('run(); // ignore this', '/project/src/a.ts')).toBeUndefined();
    expect(
      strip.transform('// v8 ignore next', '/project/node_modules/x/index.js'),
    ).toBeUndefined();
  });

  it('runs project configs with the strip plugin after the project plugins', async () => {
    const config = await resolvedConfig({
      'vitest.config.mjs': "export default { plugins: [{ name: 'mine' }], test: {} };",
    });

    expect(config.plugins.map(({ name }) => name)).toEqual([
      'mine',
      'nitpicker-strip-coverage-ignore-hints',
    ]);
  });
});

describe('a test run with the vitest config nitpicker runs tests with', () => {
  let run;

  beforeAll(() => {
    run = runQualityTests({
      'vitest.config.mjs': "export default { test: { setupFiles: ['./test/setup.mjs'] } };",
      'test/setup.mjs':
        "import { vi } from 'vitest';\nvi.stubGlobal('ResizeObserver', class {});\n",
      'test/observe.test.mjs': [
        "import { expect, it } from 'vitest';",
        "it('sees the stub', () => { expect(typeof ResizeObserver).toBe('function'); });",
        "it('still sees the stub', () => { expect(typeof ResizeObserver).toBe('function'); });",
      ].join('\n'),
    });
  });

  it('keeps globals a setup file stubs for every test', () => {
    expect({ status: run.status, passed: run.report?.numPassedTests === 2 }).toEqual({
      status: 0,
      passed: true,
    });
  });
});

function isolatedInstall(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-isolated-install-'));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, 'node_modules'));
  const vitestPackage = path.join(packageRoot, 'node_modules/vitest');
  symlinkSync(vitestPackage, path.join(root, 'node_modules/vitest'), 'dir');
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  const config = path.join(root, '.nitpicker-diff-vitest.config.ts');
  copyFileSync(new URL('../defaults/vitest.quality.config.ts', import.meta.url), config);
  return spawnSync(
    process.execPath,
    [path.join(vitestPackage, 'vitest.mjs'), 'run', '--config', config, '--reporter=json'],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NITPICKER_POLICY: '' },
      timeout: 30_000,
    },
  );
}

describe('the vitest config in an isolated install, as pnpm lays out node_modules', () => {
  let run;

  beforeAll(() => {
    run = isolatedInstall({
      'package.json': '{"type":"module"}\n',
      'vitest.config.mjs': 'export default { test: { environment: "node" } };\n',
      'src/sum.test.ts':
        "import { expect, it } from 'vitest';\nit('adds', () => expect(1 + 1).toBe(2));\n",
    });
  });

  it('layers a project config when the project lists vitest but not vite', () => {
    const summary = run.status === 0 ? JSON.parse(run.stdout) : {};

    expect(
      { status: run.status, ...pick(summary, ['numTotalTests', 'numPassedTests']) },
      run.stderr,
    ).toEqual({
      status: 0,
      numTotalTests: 1,
      numPassedTests: 1,
    });
  });
});
