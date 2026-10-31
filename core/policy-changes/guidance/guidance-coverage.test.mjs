import { describe, expect, it } from 'vitest';
import {
  POLICY_GUIDANCE,
  hasSpecificGuidance,
} from '../../diff/reporting/review/policy-guidance.mjs';
import { policyFindings } from '../../diff/reporting/review/policy-findings.mjs';
import { between } from '../build-files/test-support/policy-fixtures.mjs';
import { policyChangeFields } from '../describe-policy-changes.mjs';
import { createPolicyScope, rootSets } from '../policy-scope.mjs';

const CLASS = 'package a;\nclass A {}\n';
const GRADLE = { 'build.gradle': "plugins { id 'java' }\n", 'src/main/java/a/A.java': CLASS };
const PROJECT = { precedence: ['project', 'nitpicker'] };
const PYTEST_OPTIONS = '[tool.pytest.ini_options]\n';
const PYTEST = {
  'tests/test_core.py': 'def test_x():\n    pass\n',
  'src/app/test_inner.py': 'def test_y():\n    pass\n',
};
const PYTHON_ROOTS = { preset: 'python', python: { sourceRoots: ['src', 'lib'] } };

function synthetic(base, head, options = {}) {
  const { files = ['src/a.ts', 'src/legacy/old.ts', 'src/vendor/lib.ts'], baseFiles = files } =
    options;
  const scope = createPolicyScope({
    files,
    baseFiles,
    baseRoots: rootSets(base, '.'),
    headRoots: rootSets(head, '.'),
    headConfig: head,
    ...options.scope,
  });
  return policyChangeFields(base, head, scope);
}

function gitBacked({ base, head, config, baseConfig = config }) {
  return () => between({ base, head, config, baseConfig });
}

const exception = { rule: 'nitpicker/no-comments', paths: ['src/legacy/**'], reason: 'Legacy' };
const slowTimeouts = {
  tools: { tests: { timeouts: { languages: { java: { testDeclarationCeilingMs: 20_000 } } } } },
};

const FIXTURES = {
  'entry-point': () => synthetic({}, { layout: { entryPoints: ['src/a.ts'] } }),
  'python-entry-point': () =>
    synthetic(
      { preset: 'python', python: { sourceRoots: ['src'] } },
      { preset: 'python', python: { sourceRoots: ['src'], entryPoints: ['src/jobs.py'] } },
      { files: ['src/jobs.py'] },
    ),
  exception: () => synthetic({}, { exceptions: [exception] }),
  exclusion: () => synthetic({}, { exclude: ['src/vendor/**'] }),
  'duplicates-scope': () =>
    synthetic(
      {},
      { duplicates: { skippedFolders: ['dist', 'build', 'generated', 'target', 'src'] } },
    ),
  'hidden-exclusion': () =>
    synthetic(
      {},
      { exclude: ['lib/**'] },
      { files: ['src/a.ts', 'lib/new.ts'], baseFiles: ['src/a.ts'] },
    ),
  'hidden-exception': () =>
    synthetic(
      { exceptions: [{ ...exception, paths: ['src/other/**'] }] },
      { exceptions: [exception] },
      { files: ['src/a.ts', 'src/legacy/new.ts'], baseFiles: ['src/a.ts'] },
    ),
  'hidden-test-root': () =>
    synthetic(
      { layout: { sourceRoots: ['src'], testRoots: ['test'] } },
      { layout: { sourceRoots: ['src'], testRoots: ['test', 'src/specs'] } },
      { files: ['src/a.ts', 'src/specs/new.ts'], baseFiles: ['src/a.ts'] },
    ),
  'hidden-duplicates': () =>
    synthetic(
      {},
      { duplicates: { skippedFolders: ['legacy'] } },
      { files: ['src/legacy/new.ts'], baseFiles: [] },
    ),
  'test-root-added': () =>
    synthetic(
      { layout: { sourceRoots: ['src'], testRoots: ['test'] } },
      { layout: { sourceRoots: ['src'], testRoots: ['test', 'src/legacy'] } },
    ),
  'source-root-removed': () =>
    synthetic(
      { layout: { sourceRoots: ['src', 'lib'] } },
      { layout: { sourceRoots: ['src'] } },
      { files: ['src/a.ts', 'lib/b.ts'] },
    ),
  'test-root-removed': () =>
    synthetic(
      { layout: { sourceRoots: ['src'], testRoots: ['test', 'spec'] } },
      { layout: { sourceRoots: ['src'], testRoots: ['test'] } },
      { files: ['src/a.ts', 'spec/b.ts'] },
    ),
  'generated-marker': () =>
    synthetic({}, {}, { scope: { generated: { base: () => false, head: () => true } } }),
  'tsconfig-removed': () =>
    synthetic(
      {},
      {},
      { scope: { tsconfigs: { base: new Map([['tsconfig.json', true]]), head: new Map() } } },
    ),
  'check-js-off': () =>
    synthetic(
      {},
      {},
      {
        scope: {
          tsconfigs: {
            base: new Map([['tsconfig.json', true]]),
            head: new Map([['tsconfig.json', false]]),
          },
        },
      },
    ),
  'build-roots': gitBacked({
    base: GRADLE,
    head: {
      ...GRADLE,
      'build.gradle':
        "plugins { id 'java' }\nsourceSets { main { java { srcDirs = ['src/other/java'] } } }\n",
    },
  }),
  'test-paths': gitBacked({
    base: { ...PYTEST, 'pyproject.toml': `${PYTEST_OPTIONS}addopts = "-q"\n` },
    head: { ...PYTEST, 'pyproject.toml': `${PYTEST_OPTIONS}testpaths = ["tests"]\n` },
    config: { preset: 'python' },
  }),
  'build-filter': gitBacked({
    base: GRADLE,
    head: {
      ...GRADLE,
      'build.gradle': "plugins { id 'java' }\ncompileJava { exclude '**/A.java' }\n",
    },
  }),
  'tool-config': gitBacked({
    base: { 'config/pmd/ruleset.xml': '<ruleset a="1"/>', 'src/main/java/A.java': 'class A {}\n' },
    head: { 'config/pmd/ruleset.xml': '<ruleset a="2"/>', 'src/main/java/A.java': 'class A {}\n' },
    config: { preset: 'java', tools: { pmd: PROJECT } },
  }),
  'tool-config-opt-in': gitBacked({
    base: { 'config/pmd/ruleset.xml': '<ruleset a="1"/>', 'src/main/java/A.java': 'class A {}\n' },
    head: { 'config/pmd/ruleset.xml': '<ruleset a="1"/>', 'src/main/java/A.java': 'class A {}\n' },
    baseConfig: { preset: 'java' },
    config: { preset: 'java', tools: { pmd: PROJECT } },
  }),
  'test-timeout': () => synthetic({}, slowTimeouts),
  'test-timeout-invalid': () =>
    synthetic({}, { tools: { tests: { timeouts: { defaults: { testTimeoutMs: -1 } } } } }),
  threshold: () => synthetic({}, { thresholds: { crapLimit: 40 } }),
  'analyzer-disabled': () => synthetic({}, { disable: ['mutation'] }),
  'analyzer-changed': () =>
    synthetic({ analyzers: [{ name: 'a', command: 'x' }] }, { analyzers: [] }),
  preset: () => synthetic({ preset: 'typescript' }, { preset: 'javascript' }),
  'react-disabled': () => synthetic({}, { react: { enabled: false } }),
  'i18n-disabled': () => synthetic({}, { i18n: { enabled: false } }),
  'import-linter-disabled': () =>
    synthetic(PYTHON_ROOTS, {
      ...PYTHON_ROOTS,
      python: { ...PYTHON_ROOTS.python, importLinter: false },
    }),
  'kotlin-formatter-off': () =>
    synthetic({ preset: 'kotlin' }, { preset: 'kotlin', kotlin: { formatter: 'none' } }),
  'kotlin-detekt-config': () =>
    synthetic({ preset: 'kotlin' }, { preset: 'kotlin', kotlin: { detektConfig: 'detekt.yml' } }),
  'go-formatters-dropped': () =>
    synthetic({ preset: 'go', go: { formatters: ['gofumpt'] } }, { preset: 'go' }),
  'go-build-tags-dropped': () =>
    synthetic({ preset: 'go', go: { buildTags: ['integration'] } }, { preset: 'go' }),
  'tool-precedence': () => synthetic({}, { tools: { prettier: PROJECT } }),
  'spring-roles-shrank': () =>
    synthetic(
      { preset: 'java', spring: { roles: { service: ['com.example.UseCase'] } } },
      { preset: 'java' },
    ),
};

const VARIANTS = [
  [
    'python.sourceRoots removed',
    'source-root-removed',
    () =>
      synthetic(
        PYTHON_ROOTS,
        { preset: 'python', python: { sourceRoots: ['src'] } },
        { files: ['src/a.py', 'lib/b.py'] },
      ),
  ],
  [
    'python.exceptions added',
    'exception',
    () =>
      synthetic(
        { preset: 'python' },
        { preset: 'python', python: { exceptions: [exception] } },
        { files: ['src/legacy/old.py'] },
      ),
  ],
  [
    'layout.excludedGlobs added',
    'exclusion',
    () => synthetic({}, { layout: { excludedGlobs: ['src/vendor/**'] } }),
  ],
  [
    'tools.pmd.precedence ranked project-first',
    'tool-precedence',
    () =>
      synthetic(
        { preset: 'java' },
        { preset: 'java', tools: { pmd: { precedence: ['project'] } } },
      ),
  ],
];

describe('policy guidance kinds', () => {
  it.each(VARIANTS)('%s is %s', (_, kind, run) => {
    const fields = run();

    expect(fields.policyLoosenings.map((text) => fields.policyKinds[text])).toEqual([kind]);
  });

  it.each(Object.entries(FIXTURES))(
    '%s: its producer attaches a kind with specific guidance',
    (kind, run) => {
      const fields = run();

      expect(fields.policyLoosenings.length).toBeGreaterThan(0);
      expect(
        fields.policyLoosenings.map((text) => [
          text,
          typeof fields.policyKinds[text],
          hasSpecificGuidance(fields.policyKinds[text]),
        ]),
      ).toEqual(fields.policyLoosenings.map((text) => [text, 'string', true]));
      expect(fields.policyLoosenings.map((text) => fields.policyKinds[text])).toContain(kind);
    },
  );

  it('exercises every guidance entry, so a producer kind without guidance or a stale entry fails', () => {
    expect(Object.keys(FIXTURES).toSorted()).toEqual(Object.keys(POLICY_GUIDANCE).toSorted());
  });

  it('carries the kind to the finding, which words its message with that guidance', () => {
    const fields = FIXTURES['entry-point']();
    const [finding] = policyFindings(fields.policyLoosenings, 'd1e2f3a4b5c6', {
      kinds: fields.policyKinds,
    });

    expect(finding.policyKind).toBe('entry-point');
    expect(finding.message).toBe(
      [
        `${fields.policyLoosenings[0]}. ${POLICY_GUIDANCE['entry-point']}`,
        'If the policy change is intended, stop and ask a person reviewing this change:',
        'only they accept exactly these loosenings, with --accept-policy-change=d1e2f3a4b5c6',
        'at an interactive terminal or NITPICKER_ACCEPT_POLICY_CHANGE=d1e2f3a4b5c6 in CI.',
      ].join(' '),
    );
  });
});
