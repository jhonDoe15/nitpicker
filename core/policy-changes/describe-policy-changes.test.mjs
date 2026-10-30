import { describe, expect, it } from 'vitest';
import { describePolicyChanges, policyChangeFields } from './describe-policy-changes.mjs';
import { createPolicyScope, rootSets } from './policy-scope.mjs';

const exception = { rule: 'nitpicker/no-comments', paths: ['src/legacy/**'], reason: 'Legacy' };
const FILES = [
  'src/a.ts',
  'src/legacy/old.ts',
  'src/vendor/lib.ts',
  'src/new/b.ts',
  'src/cli/run.ts',
  'lib/c.ts',
  'tools/gen.ts',
  'docs/readme.md',
];
const NOTHING_NEW = 'covers no checked file it did not cover before';

function scopeOf(baseConfig, headConfig, files = FILES, moves) {
  const sources = new Map([...(moves?.files ?? [])].map(([from, to]) => [to, from]));
  return createPolicyScope({
    files,
    baseFiles: files.map((file) => sources.get(file) ?? file),
    baseRoots: rootSets(baseConfig, '.'),
    headRoots: rootSets(headConfig, '.'),
    headConfig,
    moves,
  });
}

function changes(baseConfig, headConfig, files = FILES, moves) {
  return describePolicyChanges(
    baseConfig,
    headConfig,
    scopeOf(baseConfig, headConfig, files, moves),
  );
}

function loosened(baseConfig, headConfig, files = FILES) {
  return changes(baseConfig, headConfig, files).loosened;
}

describe('describePolicyChanges', () => {
  it('lists nothing when the configs match', () => {
    const config = { exclude: ['a/**'], exceptions: [exception], thresholds: { crapLimit: 12 } };
    const none = { loosened: [], changed: [] };

    expect(changes(config, structuredClone(config))).toEqual(none);
    expect(changes({}, {})).toEqual(none);
  });

  it('counts added excludes, disabled analyzers and exceptions as loosening', () => {
    expect(
      loosened(
        { exclude: ['old/**', 'kept/**'], disable: ['mutation'] },
        {
          exclude: ['kept/**', 'src/vendor/**'],
          disable: ['mutation', 'crap', 'coverage'],
          exceptions: [exception],
        },
      ),
    ).toEqual([
      'exclude added: src/vendor/**',
      'exception added: nitpicker/no-comments for src/legacy/** (Legacy)',
      'analyzer disabled: crap',
      'analyzer disabled: coverage',
    ]);
  });

  it('lists an exclude or exception that covers no newly checked file without counting it', () => {
    const outsideRoots = { exclude: ['docs/**'] };
    const narrowed = { ...exception, paths: ['src/legacy/old.ts'] };
    const reworded = { ...exception, reason: 'Still legacy' };
    const moved = { ...exception, paths: ['src/old/**', 'src/new/**'] };

    expect(changes({}, outsideRoots)).toEqual({
      loosened: [],
      changed: [`exclude added: docs/** (${NOTHING_NEW})`],
    });
    expect(loosened({ exclude: ['src/vendor/**'] }, { exclude: ['src/vendor/lib.ts'] })).toEqual(
      [],
    );
    expect(loosened({ exceptions: [exception] }, { exceptions: [narrowed] })).toEqual([]);
    expect(loosened({ exceptions: [exception] }, { exceptions: [reworded] })).toEqual([]);
    expect(
      changes(
        { exceptions: [{ ...exception, paths: ['src/old/**'] }] },
        { exceptions: [moved] },
        FILES,
        { files: new Map([['src/old/b.ts', 'src/new/b.ts']]), directories: new Map() },
      ).loosened,
    ).toEqual([]);
  });

  it('counts only the paths an exception gains', () => {
    const widened = { ...exception, paths: ['src/legacy/**', 'src/new/**'] };

    expect(loosened({ exceptions: [exception] }, { exceptions: [widened] })).toEqual([
      'exception added: nitpicker/no-comments for src/new/** (Legacy)',
    ]);
  });

  it('counts a python exception like a top-level one', () => {
    const python = (exceptions) => ({
      preset: 'python',
      python: { sourceRoots: ['src'], exceptions },
    });

    expect(loosened(python([]), python([exception]), ['src/legacy/old.py'])).toEqual([
      'exception added: nitpicker/no-comments for src/legacy/** (Legacy)',
    ]);
  });

  it('counts a python entry point that hides more files, and lists a removed one', () => {
    const python = (entryPoints) => ({
      preset: 'python',
      python: { sourceRoots: ['src'], entryPoints },
    });
    const files = ['src/shop/jobs.py', 'src/shop/billing.py'];

    expect(changes(python([]), python(['src/shop/jobs.py']), files)).toEqual({
      loosened: ['python.entryPoints added: src/shop/jobs.py'],
      changed: [],
    });
    expect(changes(python(['src/shop/jobs.py']), python([]), files)).toEqual({
      loosened: [],
      changed: ['python.entryPoints removed: src/shop/jobs.py'],
    });
    expect(changes(python(['src/shop/jobs.py']), python(['src/shop/jobs.py']), files)).toEqual({
      loosened: [],
      changed: [],
    });
  });

  it('counts a threshold raised above the base or the default, or dropped back to a looser default', () => {
    expect(
      loosened(
        { thresholds: { crapLimit: 12, fileLines: 400, lineLength: 100 } },
        { thresholds: { crapLimit: 20, fileLines: 300, folderFiles: 8 } },
      ),
    ).toEqual([
      'threshold crapLimit raised from 12 to 20',
      'threshold lineLength raised from 100 to 120',
      'threshold folderFiles raised from 6 to 8',
    ]);
  });

  it('counts a slow test budget raised above the base or the default, or dropped back to a looser default', () => {
    expect(
      loosened(
        { thresholds: { unitTestSeconds: 2, integrationTestSeconds: 60 } },
        { thresholds: { integrationTestSeconds: 90 } },
      ),
    ).toEqual([
      'threshold unitTestSeconds raised from 2 to 5',
      'threshold integrationTestSeconds raised from 60 to 90',
    ]);
    expect(loosened({}, { thresholds: { unitTestSeconds: 600 } })).toEqual([
      'threshold unitTestSeconds raised from 5 to 600',
    ]);
    expect(
      loosened({ thresholds: { unitTestSeconds: 3 } }, { thresholds: { unitTestSeconds: 2 } }),
    ).toEqual([]);
  });

  it('counts a removed or changed custom analyzer and lists an added one', () => {
    expect(
      changes(
        {
          analyzers: [
            { name: 'a', command: 'x' },
            { name: 'b', command: 'y' },
          ],
        },
        {
          analyzers: [
            { name: 'b', command: 'y', args: ['--quiet'] },
            { name: 'c', command: 'z' },
          ],
        },
      ),
    ).toEqual({
      loosened: ['analyzer removed: a', 'analyzer changed: b'],
      changed: ['analyzer added: c'],
    });
  });

  it('counts layout exclusions and entry points that cover more files, and removed roots', () => {
    expect(
      changes(
        { layout: { sourceRoots: ['src', 'lib'], entryPoints: ['src/a.ts'] } },
        {
          layout: {
            sourceRoots: ['src', 'app'],
            excludedGlobs: [
              'dist/**',
              'build/**',
              'generated/**',
              'coverage/**',
              'reports/**',
              'target/**',
              '**/node_modules/**',
              '**/vendor/**',
            ],
            entryPoints: ['src/a.ts', 'src/cli/*.ts'],
          },
        },
      ),
    ).toEqual({
      loosened: [
        'layout.excludedGlobs added: **/vendor/**',
        'layout.entryPoints added: src/cli/*.ts',
        'layout.sourceRoots removed: lib',
      ],
      changed: ['layout.sourceRoots: ["src","lib"] -> ["src","app"]'],
    });
  });

  it('does not count a root renamed together with its files, or an exclude moved to excludedGlobs', () => {
    const renamed = { layout: { sourceRoots: ['source'] } };

    expect(loosened({}, renamed, ['source/a.ts'])).toEqual([]);
    expect(
      loosened(
        { exclude: ['src/vendor/**'] },
        { layout: { excludedGlobs: ['dist/**', 'src/vendor/**'] } },
      ),
    ).toEqual([]);
    expect(loosened({ layout: { testRoots: ['test', 'spec'] } }, {}, ['spec/a.test.ts'])).toEqual([
      'layout.testRoots removed: spec',
    ]);
  });

  it('counts a python source root that no longer covers its files', () => {
    const python = (sourceRoots) => ({ preset: 'python', python: { sourceRoots } });

    expect(loosened(python(['src', 'tools']), python(['src']), ['tools/run.py'])).toEqual([
      'python.sourceRoots removed: tools',
    ]);
  });

  it('compares the preset that runs, not the preset that is written', () => {
    const presetChange = (before, after) =>
      loosened(
        before === undefined ? {} : { preset: before },
        after === undefined ? {} : { preset: after },
      );

    expect(presetChange(undefined, 'typescript')).toEqual([]);
    expect(presetChange('typescript', undefined)).toEqual([]);
    expect(presetChange(undefined, 'java')).toEqual(['preset: not set -> "java"']);
    expect(presetChange(undefined, 'python')).toEqual(['preset: not set -> "python"']);
    expect(presetChange('javascript', 'typescript')).toEqual([]);
    expect(presetChange('javascript', undefined)).toEqual([]);
    expect(presetChange(undefined, 'javascript')).toEqual(['preset: not set -> "javascript"']);
    expect(presetChange('typescript', 'javascript')).toEqual([
      'preset: "typescript" -> "javascript"',
    ]);
    expect(presetChange('java', 'kotlin')).toEqual(['preset: "java" -> "kotlin"']);
    expect(presetChange('java', undefined)).toEqual(['preset: "java" -> not set']);
  });

  it('does not count declaring the preset a project without scripts has to declare', () => {
    const head = { preset: 'python' };
    const scope = createPolicyScope({
      files: [],
      baseRoots: {},
      headRoots: {},
      headConfig: head,
      presetRequired: true,
    });

    expect(describePolicyChanges({}, head, scope)).toEqual({
      loosened: [],
      changed: ['preset: not set -> "python"'],
    });
  });

  it('counts an exclude that covers code outside the roots, such as code production imports', () => {
    expect(loosened({}, { exclude: ['lib/**', 'tools/**'] })).toEqual([
      'exclude added: lib/**',
      'exclude added: tools/**',
    ]);
  });

  it('counts a removed tsconfig and checkJs turned off in any of them, and lists checkJs turned on', () => {
    const scope = (base, head) => ({
      ...scopeOf({}, {}),
      tsconfigs: { base: new Map(base), head: new Map(head) },
    });

    expect(
      describePolicyChanges(
        {},
        {},
        scope(
          [
            ['tsconfig.json', false],
            ['config/app.json', true],
            ['packages/web/tsconfig.json', false],
          ],
          [
            ['tsconfig.json', true],
            ['config/app.json', false],
          ],
        ),
      ),
    ).toEqual({
      loosened: [
        'tsconfig removed: packages/web/tsconfig.json',
        'config/app.json checkJs: true -> false',
      ],
      changed: ['tsconfig.json checkJs: false -> true'],
    });
  });

  it('lists a glob moved between exclude and layout.excludedGlobs', () => {
    expect(
      changes({ exclude: ['src/vendor/**'] }, { layout: { excludedGlobs: ['src/vendor/**'] } }),
    ).toEqual({
      loosened: [],
      changed: ['src/vendor/** moved from exclude to layout.excludedGlobs'],
    });
  });

  it('counts turning i18n off', () => {
    expect(loosened({ i18n: { enabled: true } }, { i18n: { enabled: false } })).toEqual([
      'i18n.enabled: true -> false',
    ]);
    expect(loosened({ i18n: { enabled: false } }, { i18n: { enabled: true } })).toEqual([]);
  });

  it('counts turning a check off or giving the project config precedence, not a tool swap', () => {
    expect(
      changes(
        {
          base: 'origin/main',
          react: { enabled: true, styling: 'css-modules' },
          tools: {
            prettier: { precedence: ['nitpicker'] },
            eslint: { engine: 'oxlint' },
            typescript: { engine: 'native' },
          },
        },
        {
          base: 'origin/develop',
          react: { enabled: false, styling: 'css-modules' },
          tools: {
            prettier: { precedence: ['project', 'nitpicker'] },
            eslint: { engine: 'eslint' },
            typescript: { engine: 'project' },
          },
          legacyInventory: 'legacy.json',
        },
      ),
    ).toEqual({
      loosened: [
        'react.enabled: true -> false',
        'tools.prettier.precedence: ["nitpicker"] -> ["project","nitpicker"]',
      ],
      changed: [
        'base: "origin/main" -> "origin/develop"',
        'tools.eslint.engine: "oxlint" -> "eslint"',
        'tools.typescript.engine: "native" -> "project"',
        'legacyInventory: not set -> "legacy.json"',
      ],
    });
  });

  it('counts precedence by what the tool runs', () => {
    const precedence = (tool, before, after, preset = 'java') =>
      loosened(
        { preset, tools: { [tool]: { precedence: before } } },
        { preset, tools: { [tool]: { precedence: after } } },
      );

    expect(precedence('pmd', ['nitpicker'], ['project', 'nitpicker'])).toEqual([]);
    expect(precedence('pmd', ['nitpicker', 'project'], ['project'])).toEqual([
      'tools.pmd.precedence: ["nitpicker","project"] -> ["project"]',
    ]);
    const script = (before, after) => precedence('knip', before, after, 'typescript');
    expect(script(['nitpicker'], ['nitpicker', 'project'])).toEqual([
      'tools.knip.precedence: ["nitpicker"] -> ["nitpicker","project"]',
    ]);
    expect(script(['nitpicker', 'project'], ['project'])).toHaveLength(1);
    expect(script(['project'], ['project', 'nitpicker'])).toEqual([]);
    expect(script(['project', 'nitpicker'], ['nitpicker', 'project'])).toEqual([]);
    expect(precedence('checkstyle', ['project'], ['nitpicker'])).toEqual([]);
    expect(precedence('checkstyle', ['nitpicker'], ['project'])).toEqual([
      'tools.checkstyle.precedence: ["nitpicker"] -> ["project"]',
    ]);
  });

  it('counts any ESLint opt-in that lists the project, since its ignores apply with nitpicker first too', () => {
    const eslint = (before, after) =>
      loosened(
        { tools: { eslint: { precedence: before } } },
        { tools: { eslint: { precedence: after } } },
      );

    expect(eslint(['nitpicker'], ['nitpicker', 'project'])).toEqual([
      'tools.eslint.precedence: ["nitpicker"] -> ["nitpicker","project"]',
    ]);
    expect(eslint(['nitpicker', 'project'], ['project'])).toEqual([
      'tools.eslint.precedence: ["nitpicker","project"] -> ["project"]',
    ]);
    expect(eslint(['project'], ['project', 'nitpicker'])).toEqual([]);
    expect(eslint(['project', 'nitpicker'], ['nitpicker', 'project'])).toEqual([]);
  });

  it('counts python and kotlin switches that turn a check off, not a swapped tool', () => {
    expect(
      changes(
        {
          preset: 'python',
          python: { importLinter: true, typeChecker: 'mypy', formatter: 'ruff' },
        },
        {
          preset: 'python',
          python: { importLinter: false, typeChecker: 'pyright', formatter: 'black' },
        },
        [],
      ),
    ).toEqual({
      loosened: ['python.importLinter: true -> false'],
      changed: ['python.typeChecker: "mypy" -> "pyright"', 'python.formatter: "ruff" -> "black"'],
    });
    expect(
      changes(
        { preset: 'kotlin', kotlin: { formatter: 'ktlint', detektConfig: 'config/detekt.yml' } },
        { preset: 'kotlin', kotlin: { formatter: 'none' } },
        [],
      ).loosened,
    ).toEqual([
      'kotlin.formatter: "ktlint" -> "none"',
      'kotlin.detektConfig: "config/detekt.yml" -> not set',
    ]);
    expect(
      loosened(
        { preset: 'kotlin', kotlin: { formatter: 'ktlint' } },
        { preset: 'kotlin', kotlin: { formatter: 'ktfmt' } },
        [],
      ),
    ).toEqual([]);
  });

  it('counts a Spring role mapping that drops a type as loosened and one that adds a type as changed', () => {
    const roles = (service) => ({ preset: 'java', spring: { roles: { service } } });

    expect(
      changes(roles(['com.acme.UseCase']), roles(['com.acme.UseCase', 'com.acme.Job']), []),
    ).toEqual({
      loosened: [],
      changed: [
        'spring.roles.service: ["com.acme.UseCase"] -> ["com.acme.UseCase","com.acme.Job"]',
      ],
    });
    expect(loosened(roles(['com.acme.UseCase']), { preset: 'java' }, [])).toEqual([
      'spring.roles.service: ["com.acme.UseCase"] -> not set',
    ]);
  });

  it('lists the tightenings: removed globs and exceptions, enabled analyzers, lowered thresholds', () => {
    expect(
      changes(
        {
          exclude: ['src/vendor/**'],
          disable: ['mutation'],
          exceptions: [{ ...exception, paths: ['src/legacy/**', 'src/a.ts'] }],
          thresholds: { fileLines: 500 },
          layout: { entryPoints: ['src/cli/run.ts'] },
        },
        { exceptions: [exception] },
      ),
    ).toEqual({
      loosened: [],
      changed: [
        'exclude removed: src/vendor/**',
        'layout.entryPoints removed: src/cli/run.ts',
        'exception removed: nitpicker/no-comments for src/a.ts',
        'analyzer enabled: mutation',
        'threshold fileLines lowered from 500 to 300',
      ],
    });
  });

  it('lists the loosening changes first in the summary fields', () => {
    const base = { base: 'a' };
    const head = { base: 'b', exclude: ['src/vendor/**'] };

    expect(policyChangeFields(base, head, scopeOf(base, head))).toEqual({
      policyChanges: ['exclude added: src/vendor/**', 'base: "a" -> "b"'],
      policyLoosenings: ['exclude added: src/vendor/**'],
      policyKinds: { 'exclude added: src/vendor/**': 'exclusion' },
      policyDigest: expect.stringMatching(/^[0-9a-f]{12}$/u),
    });
  });
});
