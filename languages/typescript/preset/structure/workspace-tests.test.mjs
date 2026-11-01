import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { uncollectedWorkspaceTestFindings } from './workspace-tests.mjs';

const temporaryRoots = [];
const TEST = "it('x', () => {});\n";

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-workspace-tests-'));
  temporaryRoots.push(root);
  const all = {
    'package.json': JSON.stringify({
      workspaces: ['packages/*'],
      scripts: { test: 'npm test --workspaces' },
    }),
    'packages/api/package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
    'packages/api/src/api.test.ts': TEST,
    'packages/web/package.json': '{}',
    'packages/web/src/a.test.ts': TEST,
    'packages/web/src/b.spec.tsx': TEST,
    'packages/web/node_modules/dep/c.test.js': TEST,
    'packages/docs/package.json': '{}',
    'packages/docs/README.md': '# docs\n',
    ...files,
  };
  for (const [name, text] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function findings(files, exceptions = []) {
  return uncollectedWorkspaceTestFindings(workspace(files), {
    analyzerName: 'structure',
    exceptions,
  });
}

const ALLOWED_FORM =
  "Add a `test` script to its package.json, or add the package to the root test config's `projects`.";
const fix =
  'Add a `test` script to its package.json, or add the package to the root test config\'s `projects`. If this is intended, add {"rule":"nitpicker/no-uncollected-tests","paths":["packages/web/package.json"],"reason":"..."} to "exceptions" in nitpicker.config.json.';

describe('workspace packages whose tests nothing runs', () => {
  it('are reported on their package.json, once per package, counting its test files', () => {
    expect(findings({})).toEqual([
      {
        tool: 'structure',
        rule: 'nitpicker/no-uncollected-tests',
        path: 'packages/web/package.json',
        identity: 'uncollected-workspace-tests:2',
        message: `Nothing runs the 2 test files of this workspace package: it has no \`test\` script and the root test config does not include it. ${fix}`,
        allowedForm: ALLOWED_FORM,
        classification: 'enforceable',
        ratchet: {
          key: 'uncollected-workspace-tests',
          value: 2,
          worseAllowedForm: ALLOWED_FORM,
          worseMessage: `The test files of this workspace package that nothing runs grew from {base} to 2: it has no \`test\` script and the root test config does not include it. ${fix}`,
          heldMessage:
            'Workspace package: 2 test files that nothing runs, allowed because base had {base}; any new one fails.',
        },
      },
    ]);
  });

  it.each([
    [
      'a root vitest config with no projects',
      { 'vitest.config.ts': 'export default { test: {} };' },
    ],
    [
      'a root vitest project glob',
      { 'vitest.config.ts': "export default { test: { projects: ['packages/*'] } };" },
    ],
    [
      "a root vitest project that names the package's config",
      {
        'vitest.config.mjs':
          "export default { test: { projects: ['./packages/web/vitest.config.ts'] } };",
      },
    ],
    [
      'a root include that matches its tests',
      { 'vite.config.ts': "export default { test: { include: ['packages/**/*.test.ts'] } };" },
    ],
    [
      'jest projects in the root package.json',
      {
        'package.json': JSON.stringify({
          workspaces: { packages: ['packages/*'] },
          scripts: { test: 'jest' },
          jest: { projects: ['<rootDir>/packages/*'] },
        }),
      },
    ],
    [
      'a root test script that runs vitest itself',
      {
        'package.json': JSON.stringify({
          workspaces: ['packages/*'],
          scripts: { test: 'vitest run' },
        }),
      },
    ],
    [
      'its own test script',
      { 'packages/web/package.json': JSON.stringify({ scripts: { test: 'vitest run' } }) },
    ],
  ])('are not reported when %s runs them', (_name, files) => {
    expect(findings(files)).toEqual([]);
  });

  it.each([
    [
      'the root projects leave the package out',
      {
        'vitest.config.ts':
          "export default { test: { projects: ['packages/api', '!packages/web'], coverage: { include: ['packages/**'] } } };",
      },
    ],
    [
      'pnpm lists the package and the root has no test runner',
      {
        'package.json': JSON.stringify({ scripts: { test: 'pnpm -r test' } }),
        'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n  - '!packages/api'\n",
      },
    ],
  ])('are reported when %s', (_name, files) => {
    expect(findings(files).map(({ path: file }) => file)).toEqual(['packages/web/package.json']);
  });

  it('are lifted by an exception for nitpicker/no-uncollected-tests and need workspaces', () => {
    const exception = {
      rule: 'nitpicker/no-uncollected-tests',
      paths: ['packages/web/package.json'],
      reason: 'Run by CI',
    };

    expect(findings({}, [exception])).toEqual([]);
    expect(findings({ 'package.json': '{}' })).toEqual([]);
  });
});
