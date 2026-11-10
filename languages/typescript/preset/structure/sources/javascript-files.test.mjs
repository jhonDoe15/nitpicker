import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  nestedCheckout,
  useGitCheckouts,
} from '../../../../../core/diff/git/test-support/git-checkout.mjs';
import { useProjectFixtures } from '../../../../../core/diff/git/test-support/projects/project-fixtures.mjs';
import { resolveLayout } from '../../layout.mjs';
import { javascriptFileFindings } from './javascript-files.mjs';

const { gitCheckout } = useGitCheckouts();
const { outsideGit } = useProjectFixtures();

const TSCONFIG = { 'tsconfig.json': '{ "compilerOptions": { "strict": true } }\n' };
const SCRIPTS = {
  'src/orders/parse.mjs': 'export const a = 1;\n',
  'src/orders/view.jsx': 'export const b = 1;\n',
  'src/orders/total.ts': 'export const c = 1;\n',
  'tests/orders.test.js': 'export {};\n',
  'scripts/build.mjs': 'export {};\n',
  'src/cli.cjs': 'module.exports = {};\n',
};

function project(files) {
  return outsideGit(files);
}

const AGENT_TSCONFIG = { 'tsconfig.json': '{}' };

function findingsOf(root, policy = {}, liveProjectRoot = root) {
  return javascriptFileFindings({
    projectRoot: root,
    liveProjectRoot,
    analyzerName: 'structure',
    layout: resolveLayout(),
    policy: { exceptions: [], ...policy },
  });
}

describe('javascript-in-typescript-project', () => {
  it('reports each script file under the roots of a project with a tsconfig, naming the TypeScript form', () => {
    const findings = findingsOf(project({ ...TSCONFIG, ...SCRIPTS }));

    expect(findings.map(({ path: file, identity }) => [file, identity])).toEqual([
      ['src/cli.cjs', 'javascript-in-typescript-project'],
      ['src/orders/parse.mjs', 'javascript-in-typescript-project'],
      ['src/orders/view.jsx', 'javascript-in-typescript-project'],
      ['tests/orders.test.js', 'javascript-in-typescript-project'],
    ]);
    expect(findings[1].message).toBe(
      'src/orders/parse.mjs is JavaScript in a TypeScript project, so its values are not type-checked. ' +
        'Write it as a .ts or .tsx file: src/orders/parse.ts. If this is intended, add ' +
        '{"rule":"javascript-in-typescript-project","paths":["src/orders/parse.mjs"],"reason":"..."} ' +
        'to "exceptions" in nitpicker.config.json.',
    );
    expect(findings[2].message.split('. ')[1]).toBe(
      'Write it as a .ts or .tsx file: src/orders/view.tsx',
    );
  });

  it('lifts only for an exception, and skips test fixtures, JavaScript projects and projects without a tsconfig', () => {
    const root = project({
      ...TSCONFIG,
      ...SCRIPTS,
      'tests/fixtures/legacy-module.cjs': 'module.exports = {};\n',
      'src/orders/__tests__/__fixtures__/input.js': 'export {};\n',
    });
    const exception = {
      rule: 'javascript-in-typescript-project',
      paths: ['src/orders/**'],
      reason: 'r',
    };

    expect(
      findingsOf(root, {
        layout: { entryPoints: ['src/cli.cjs'] },
        exceptions: [exception],
      }).map(({ path: file }) => file),
    ).toEqual(['src/cli.cjs', 'tests/orders.test.js']);
    expect(findingsOf(root, { preset: 'javascript' })).toEqual([]);
    expect(findingsOf(project(SCRIPTS))).toEqual([]);
  });

  it('counts a tsconfig in a package, but not one in a hidden folder', () => {
    const scripts = { 'src/orders/parse.mjs': 'export {};\n' };
    const packaged = project({ ...scripts, 'packages/shared/tsconfig.json': '{}' });
    const vendored = project({ ...scripts, 'vendor/tsconfig.json': '{}' });
    const hidden = resolveLayout({}, ['vendor/**']);
    const findings = (root, layout = resolveLayout()) =>
      javascriptFileFindings({
        projectRoot: root,
        analyzerName: 'structure',
        layout,
        policy: { exceptions: [] },
      });

    expect([findings(packaged).length, findings(vendored, hidden).length]).toEqual([1, 0]);
  });

  it('decides from the head checkout, so a change that adds the tsconfig keeps old scripts old', () => {
    const base = project(SCRIPTS);
    const head = project({ ...TSCONFIG, ...SCRIPTS });

    expect(findingsOf(base, {}, head)).toHaveLength(4);
  });

  it('ignores a tsconfig in a git-ignored folder and in a nested checkout of a Git project', () => {
    const root = gitCheckout(
      {
        ...SCRIPTS,
        ...nestedCheckout('agent', AGENT_TSCONFIG),
        '.scratch/fixture/tsconfig.json': '{}',
        '.scratch/tsconfig.json': '{}',
        'build/tsconfig.json': '{}',
      },
      ['.scratch/', 'build/'],
    );

    expect(findingsOf(root)).toEqual([]);
    writeFileSync(path.join(root, 'tsconfig.json'), '{}');
    expect(findingsOf(root)).toHaveLength(4);
  });

  it('still skips a nested checkout when the project is not a Git checkout', () => {
    const repository = { ...SCRIPTS, 'agent/tsconfig.json': '{}', 'agent/.git/HEAD': 'ref\n' };
    const worktree = { ...SCRIPTS, ...nestedCheckout('agent', AGENT_TSCONFIG) };

    expect(findingsOf(project(repository))).toEqual([]);
    expect(findingsOf(project(worktree))).toEqual([]);
    expect(findingsOf(project({ ...SCRIPTS, 'agent/tsconfig.json': '{}' }))).toHaveLength(4);
    expect(findingsOf(gitCheckout({ ...SCRIPTS, 'agent/tsconfig.json': '{}' }))).toHaveLength(4);
  });
});
