import { describe, expect, it } from 'vitest';
import { createGoAnalyzers } from '../../../languages/go/adapters/go-analyzer.mjs';
import { createJavaAnalyzer } from '../../../languages/java/adapters/java-analyzer.mjs';
import {
  createPythonAnalyzers,
  MUTATION_ANALYZER_NAME,
  PYTHON_ANALYZER_NAME,
} from '../../../languages/python/adapters/python-analyzer.mjs';
import { configuredAnalyzers } from '../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { createHistoryAnalyzers } from '../../../shared/history/analyzers.mjs';
import { createHygieneAnalyzers } from '../../../shared/hygiene/analyzers.mjs';
import { planAnalyzerRuns } from './plan.mjs';

const hygiene = createHygieneAnalyzers('entry.mjs');
const history = createHistoryAnalyzers('entry.mjs');
const modified = (...paths) => paths.map((path) => ({ path, kind: 'modified' }));
const added = (...paths) => paths.map((path) => ({ path, kind: 'added' }));

function plan(analyzers, changes, readsContent = () => false, roots = []) {
  return planAnalyzerRuns({ analyzers, changes, readsContent, roots });
}

function typescript() {
  return [...configuredAnalyzers(), ...hygiene];
}

describe('planAnalyzerRuns on TypeScript', () => {
  const analyzers = typescript();
  const names = analyzers.map(({ name }) => name);

  it('runs no analyzer for a documentation-only change', () => {
    const result = plan(analyzers, modified('README.md', 'docs/usage.md'));

    expect(result.affected).toEqual([]);
    expect(result.skipped).toEqual(names);
  });

  it('runs the analyzers that execute code for an image, which a test may read', () => {
    const result = plan(analyzers, modified('docs/flow.png'));

    expect(result.affected.toSorted((left, right) => left.localeCompare(right))).toEqual([
      'coverage',
      'crap',
      MUTATION_ANALYZER_NAME,
      'test-console',
      'test-runtime',
    ]);
  });

  it('runs every analyzer for documentation under a configured source or test root', () => {
    const result = plan(analyzers, modified('lib/notes.md'), () => false, ['lib']);

    expect(result.skipped).not.toContain('coverage');
  });

  it('runs the repository checks when the documentation file changes shape or holds a secret', () => {
    const result = plan(analyzers, modified('README.md'), () => true);

    expect(result.affected).toEqual(['repository-hygiene']);
  });

  it('runs the repository checks for an added documentation file', () => {
    const result = plan(analyzers, added('docs/new.md'), () => true);

    expect(result.affected).toEqual(['repository-hygiene']);
  });

  it.each(['nitpicker.config.json', 'package.json', 'package-lock.json', 'tsconfig.json'])(
    'runs every analyzer for a change to %s',
    (file) => {
      expect(plan(analyzers, modified(file)).skipped).toEqual([]);
    },
  );

  it('runs every analyzer for a source change', () => {
    expect(plan(analyzers, modified('src/main/app.ts')).skipped).toEqual([]);
  });

  it('runs only the analyzers that run tests for a change to a test data file', () => {
    const result = plan(analyzers, modified('test/fixtures/rows.csv'));

    expect(result.affected).toEqual([
      'test-runtime',
      'coverage',
      'test-console',
      'crap',
      MUTATION_ANALYZER_NAME,
      'repository-hygiene',
    ]);
    expect(result.skipped).toEqual([
      'eslint-lint',
      'eslint-errors',
      'eslint-logging',
      'eslint-module-effects',
      'entry-points',
      'prettier-format',
      'typescript-typecheck',
      'dependency-architecture',
      'coding-standards',
      'coupling',
      'structure',
      'duplicates',
      'dead-code',
    ]);
  });

  it('declares inputs for every built-in analyzer', () => {
    expect(analyzers.filter(({ inputs }) => inputs === undefined)).toEqual([]);
  });
});

describe('planAnalyzerRuns on Java', () => {
  const analyzers = [createJavaAnalyzer(), ...hygiene];

  it('runs no analyzer for a documentation-only change', () => {
    expect(plan(analyzers, modified('README.md', 'docs/guide.md')).affected).toEqual([]);
  });

  it.each(['build.gradle', 'settings.gradle.kts', 'gradle/libs.versions.toml', 'pom.xml'])(
    'runs the build for a change to %s',
    (file) => {
      expect(plan(analyzers, modified(file)).affected).toEqual(['java', 'repository-hygiene']);
    },
  );

  it.each(['src/main/java/demo/Greeter.java', 'src/test/resources/data.sql'])(
    'runs the build for %s',
    (file) => {
      expect(plan(analyzers, modified(file)).skipped).toEqual([]);
    },
  );

  it('treats Kotlin the same', () => {
    const kotlin = [createJavaAnalyzer({ kotlin: true })];

    expect(plan(kotlin, modified('CHANGELOG.md')).skipped).toEqual(['kotlin']);
    expect(plan(kotlin, modified('build.gradle.kts')).skipped).toEqual([]);
  });
});

describe('planAnalyzerRuns on Python and Go', () => {
  it('skips Python and its mutation run for documentation and runs both for a build file', () => {
    const analyzers = createPythonAnalyzers();

    expect(plan(analyzers, modified('README.md')).skipped).toEqual([
      PYTHON_ANALYZER_NAME,
      MUTATION_ANALYZER_NAME,
    ]);
    expect(plan(analyzers, modified('pyproject.toml')).skipped).toEqual([]);
    expect(plan(analyzers, modified('src/pkg/mod.py')).skipped).toEqual([]);
  });

  it('skips Go for documentation and runs it for go.mod', () => {
    const analyzers = createGoAnalyzers();

    expect(plan(analyzers, modified('docs/design.md')).affected).toEqual([]);
    expect(plan(analyzers, modified('go.mod')).skipped).toEqual([]);
  });
});

describe('planAnalyzerRuns requirements', () => {
  const custom = { name: 'custom-checker', custom: true, inputs: { scope: 'execution' } };

  it('always runs a custom analyzer and one without declared inputs', () => {
    const result = plan([custom, { name: 'undeclared' }], modified('README.md'));

    expect(result.affected).toEqual(['custom-checker', 'undeclared']);
  });

  it('keeps the analyzers a running analyzer depends on or shares imports with', () => {
    const analyzers = [
      { name: 'publisher', inputs: { scope: 'execution' }, publishesModuleImports: true },
      { name: 'base', inputs: { scope: 'execution' } },
      { name: 'dependent', inputs: { scope: 'everything' }, dependencies: ['base'] },
      ...history.map((analyzer) => ({ ...analyzer, colocatedWith: ['publisher'] })),
    ];

    const result = plan(analyzers, modified('README.md'));

    expect(result.affected).toEqual(['publisher', 'base', 'dependent', 'change-history']);
  });
});

describe('planAnalyzerRuns on stylesheets', () => {
  it.each(['src/a.styl', 'src/a.pcss'])('runs the static TypeScript analyzers for %s', (file) => {
    const result = plan(configuredAnalyzers(), modified(file));

    expect(result.skipped).toEqual([]);
  });
});
