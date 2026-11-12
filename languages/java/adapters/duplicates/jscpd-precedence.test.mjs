import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveHeadPolicy, withHeadPolicyFile } from '../../../typescript/preset/head-policy.mjs';
import { readDuplicateFindings, runJavaDuplicates } from '../metrics/java-duplicates.mjs';
import { readKotlinDuplicateFindings, runKotlinDuplicates } from '../kotlin/kotlin-duplicates.mjs';

const roots = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const STATEMENTS = [
  'int total = 0;',
  'for (int i = 0; i < a; i++) {',
  '    if (i % 2 == 0 && b > 0) {',
  '        total += i * b;',
  '    } else {',
  '        total -= b;',
  '    }',
  '}',
  'return total;',
];
const JAVA_BODY = ['public int run(int a, int b) {', ...STATEMENTS, '}'].join('\n');
const KOTLIN_BODY = [
  'fun run(a: Int, b: Int): Int {',
  '    var total = 0',
  '    for (i in 0 until a) {',
  '        if (i % 2 == 0 && b > 0) {',
  '            total += i * b',
  '        } else {',
  '            total -= b',
  '        }',
  '    }',
  '    return total',
  '}',
].join('\n');

const LANGUAGES = [
  ['java', 'java', (name) => `package demo;\n\nclass ${name} {\n${JAVA_BODY}\n}\n`],
  ['kotlin', 'kt', (name) => `package demo\n\nclass ${name} {\n${KOTLIN_BODY}\n}\n`],
];
const RUNNERS = {
  java: [runJavaDuplicates, readDuplicateFindings],
  kotlin: [runKotlinDuplicates, readKotlinDuplicateFindings],
};

function project(preset, extension, source, projectConfig) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-jvm-jscpd-')));
  roots.push(root);
  const sourceRoot = `src/main/${preset}`;
  const manifest = { sourceRoots: [sourceRoot], kotlinSourceRoots: [sourceRoot] };
  mkdirSync(path.join(root, 'build/nitpicker'), { recursive: true });
  writeFileSync(path.join(root, 'build/nitpicker/manifest.json'), JSON.stringify(manifest));
  mkdirSync(path.join(root, sourceRoot, 'demo'), { recursive: true });
  for (const name of ['One', 'Two']) {
    writeFileSync(path.join(root, sourceRoot, `demo/${name}.${extension}`), source(name));
  }
  writeFileSync(path.join(root, '.jscpd.json'), JSON.stringify(projectConfig));
  return { root, first: `${sourceRoot}/demo/One.${extension}` };
}

function clonesWith(preset, root, precedence) {
  const [run, read] = RUNNERS[preset];
  const policy = resolveHeadPolicy({ preset, tools: { jscpd: { precedence } } }, root);
  return withHeadPolicyFile(policy, (policyFile) => {
    vi.stubEnv('NITPICKER_POLICY', policyFile);
    const reportRoot = path.join(root, 'build/nitpicker');
    const manifest = JSON.parse(readFileSync(path.join(reportRoot, 'manifest.json'), 'utf8'));
    run(root, { reportRoot, manifest });
    return read(reportRoot)
      .filter(({ rule }) => rule === 'duplicate-clone')
      .map(({ path: file }) => file);
  });
}

describe('jscpd precedence in the Java and Kotlin presets', () => {
  it.each(LANGUAGES)('layers the head .jscpd.json for %s', (preset, extension, source) => {
    const { root, first } = project(preset, extension, source, { minTokens: 10000 });
    const orderings = [
      [['nitpicker'], [first]],
      [['project'], []],
      [['project', 'nitpicker'], []],
      [['nitpicker', 'project'], [first]],
    ];
    expect(orderings.map(([precedence]) => clonesWith(preset, root, precedence))).toEqual(
      orderings.map(([, expected]) => expected),
    );
  });

  it.each(LANGUAGES)(
    'adds the project ignores to nitpicker’s for %s',
    (preset, extension, source) => {
      const { root, first } = project(preset, extension, source, { ignore: ['**/Two.*'] });
      expect(clonesWith(preset, root, ['nitpicker'])).toEqual([first]);
      expect(clonesWith(preset, root, ['nitpicker', 'project'])).toEqual([]);
    },
  );
});
