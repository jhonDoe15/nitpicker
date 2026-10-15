import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const configUrl = pathToFileURL(
  path.join(import.meta.dirname, '../defaults/vitest.quality.config.ts'),
).href;
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
    writeFileSync(path.join(root, name), text);
  }
  const previous = process.cwd();
  process.chdir(root);
  try {
    const { default: config } = await import(`${configUrl}?run=${String(temporaryRoots.length)}`);
    return await config({ command: 'serve', mode: 'test' });
  } finally {
    process.chdir(previous);
  }
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
  testTimeout: 10_000,
  hookTimeout: 10_000,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
};

describe('the vitest config nitpicker runs tests with', () => {
  it('pins every option that changes pass or fail over a project config', async () => {
    const config = await resolvedConfig({
      'vitest.config.mjs': `export default { test: ${looseProjectTest} };`,
    });

    expect(config.test).toMatchObject({
      ...pinnedGlobal,
      ...pinnedPerProject,
      environment: 'jsdom',
    });
  });

  it('pins the options of inline projects in a project config and keeps their other settings', async () => {
    const config = await resolvedConfig({
      'vitest.config.mjs': `export default { test: { projects: [
        { test: { name: 'ui', ...${looseProjectTest} } },
        './packages/api',
      ] } };`,
    });

    expect(config.test.projects).toEqual([
      { test: expect.objectContaining({ name: 'ui', environment: 'jsdom', ...pinnedPerProject }) },
      './packages/api',
    ]);
  });

  it('pins the same options when the project has no vitest config', async () => {
    const config = await resolvedConfig({});

    expect(config.test).toMatchObject(pinnedGlobal);
    expect(config.test.projects.map(({ test }) => test)).toEqual([
      expect.objectContaining(pinnedPerProject),
      expect.objectContaining(pinnedPerProject),
    ]);
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
