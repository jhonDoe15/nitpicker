import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayout } from '../../layout.mjs';
import { javascriptFileFindings } from './javascript-files.mjs';

const temporaryRoots = [];
const TSCONFIG = { 'tsconfig.json': '{ "compilerOptions": { "strict": true } }\n' };
const SCRIPTS = {
  'src/orders/parse.mjs': 'export const a = 1;\n',
  'src/orders/view.jsx': 'export const b = 1;\n',
  'src/orders/total.ts': 'export const c = 1;\n',
  'tests/orders.test.js': 'export {};\n',
  'scripts/build.mjs': 'export {};\n',
  'src/cli.cjs': 'module.exports = {};\n',
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-javascript-files-'));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

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
        'Write it as src/orders/parse.mts instead. If this is intended, add ' +
        '{"rule":"javascript-in-typescript-project","paths":["src/orders/parse.mjs"],"reason":"..."} ' +
        'to "exceptions" in nitpicker.config.json.',
    );
    expect(findings[2].message).toContain('Write it as src/orders/view.tsx instead.');
  });

  it('skips entry points, excepted paths, JavaScript projects and projects without a tsconfig', () => {
    const root = project({ ...TSCONFIG, ...SCRIPTS });
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
    ).toEqual(['tests/orders.test.js']);
    expect(findingsOf(root, { preset: 'javascript' })).toEqual([]);
    expect(findingsOf(project(SCRIPTS))).toEqual([]);
  });

  it('decides from the head checkout, so a change that adds the tsconfig keeps old scripts old', () => {
    const base = project(SCRIPTS);
    const head = project({ ...TSCONFIG, ...SCRIPTS });

    expect(findingsOf(base, {}, head)).toHaveLength(4);
  });
});
