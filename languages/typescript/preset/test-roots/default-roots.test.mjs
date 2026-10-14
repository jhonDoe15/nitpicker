import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createVitest } from 'vitest/node';
import { afterAll, describe, expect, it } from 'vitest';

const defaults = path.join(import.meta.dirname, '..', 'defaults');
const temporaryRoots = [];
const projectFiles = {
  '__tests__/jest.test.ts': "describe('jest', () => { it('runs', () => { jest.fn(); }); });",
  'e2e/api.test.ts': "it('serves', () => {});",
  'src/add.test.ts': "it('adds', () => {});",
  'test/add.test.ts': "it('adds', () => {});",
};

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeProject(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-roots-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

async function selectedTests(policy) {
  const root = writeProject(projectFiles);
  const policyFile = path.join(
    writeProject({ 'policy.json': JSON.stringify(policy) }),
    'policy.json',
  );
  const previous = process.env.NITPICKER_POLICY;
  process.env.NITPICKER_POLICY = policyFile;
  const vitest = await createVitest('test', {
    root,
    config: path.join(defaults, 'vitest.quality.config.ts'),
    watch: false,
    reporters: [],
  });
  try {
    const specifications = await vitest.globTestSpecifications();
    return specifications
      .map((specification) => path.relative(root, specification.moduleId))
      .sort();
  } finally {
    await vitest.close();
    if (previous === undefined) {
      delete process.env.NITPICKER_POLICY;
    } else {
      process.env.NITPICKER_POLICY = previous;
    }
  }
}

describe('the tests the quality run selects', () => {
  it('are those under the default roots, leaving a root e2e folder to its own runner', async () => {
    expect(await selectedTests({})).toEqual([
      '__tests__/jest.test.ts',
      'src/add.test.ts',
      'test/add.test.ts',
    ]);
  });

  it('leave out a root __tests__ folder that exclude names', async () => {
    expect(await selectedTests({ exclude: ['__tests__/**'] })).toEqual([
      'src/add.test.ts',
      'test/add.test.ts',
    ]);
  });

  it('are those under the listed test roots, e2e included when it is listed', async () => {
    expect(await selectedTests({ layout: { testRoots: ['test', 'e2e'] } })).toEqual([
      'e2e/api.test.ts',
      'src/add.test.ts',
      'test/add.test.ts',
    ]);
  });
});

describe('the dependency-cruiser production-to-test rule', () => {
  async function productionToTestTarget() {
    const previous = process.env.NITPICKER_POLICY;
    delete process.env.NITPICKER_POLICY;
    try {
      const url = pathToFileURL(path.join(defaults, 'dependency-cruiser.config.mjs'));
      url.search = 'default-roots';
      const { default: config } = await import(url.href);
      return new RegExp(config.forbidden[0].to.path);
    } finally {
      if (previous !== undefined) {
        process.env.NITPICKER_POLICY = previous;
      }
    }
  }

  it('names the root test folders and test files, not a folder called e2e inside the source', async () => {
    const target = await productionToTestTarget();

    expect(
      [
        'e2e/support/page.ts',
        '__tests__/jest.test.ts',
        'test/helper.ts',
        'src/ui/__tests__/panel.ts',
        'src/ui/panel.test.ts',
        'src/crypto/e2e/encrypt.ts',
        'src/test/clock.ts',
      ].map((file) => target.test(file)),
    ).toEqual([true, true, true, true, true, false, false]);
  });
});
