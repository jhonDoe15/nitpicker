import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { defineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import { fixWorkingTree } from '../../../../core/fix/run-fix.mts';
import { fakeJvmTools } from '../test-support/fake-jvm-tools.mjs';

const { createGitRepository, temporaryRoot } = useGitFixtures();
const JAVA = 'src/main/java/demo';
const KT = 'src/main/kotlin/demo';
const BUILDS = {
  gradle: { 'build.gradle': "plugins { id 'java' }\n" },
  maven: { 'pom.xml': '<project/>\n' },
};
const MARKER = /QUALITY_FINDING (\{[^}]*\})/gu;

afterEach(() => {
  vi.unstubAllEnvs();
});

function marker(tool, rule) {
  return `QUALITY_FINDING {"tool":"${tool}","rule":"${rule}"}`;
}

function recipe(id, rule, replacement) {
  return {
    id,
    rules: [{ tool: 'checkstyle', rule }],
    presets: ['java', 'kotlin'],
    scope: 'file',
    safety: 'safe',
    plan: ({ files }) => ({
      fixes: files.flatMap(({ path: name, text }) => {
        const start = text.indexOf(marker('checkstyle', rule));
        return start === -1
          ? []
          : [
              {
                finding: { tool: 'checkstyle', rule, path: name, line: 1 },
                edits: [
                  {
                    type: 'replace',
                    path: name,
                    start,
                    end: start + marker('checkstyle', rule).length,
                    text: replacement,
                  },
                ],
              },
            ];
      }),
    }),
  };
}

const RECIPES = defineRecipes([
  recipe('fixes-it', 'Good', 'RESOLVED'),
  recipe('adds-one', 'Adds', marker('checkstyle', 'Fresh')),
  recipe('breaks-build', 'Breaks', marker('build', 'compile-error')),
  recipe('keeps-it', 'Stays', `RESOLVED ${marker('checkstyle', 'Stays')}`),
]);

function analyzerOf(root) {
  return ({ files }) => ({
    findings: files.flatMap((name) =>
      [...readFileSync(path.join(root, name), 'utf8').matchAll(MARKER)].map(([, json]) => ({
        ...JSON.parse(json),
        path: name,
        classification: 'enforceable',
      })),
    ),
  });
}

function sources(directory, extension) {
  return Object.fromEntries(
    [
      ['Good', 'Good'],
      ['Adds', 'Adds'],
      ['Breaks', 'Breaks'],
      ['Stays', 'Stays'],
    ].map(([name, rule]) => [
      `${directory}/${name}.${extension}`,
      `// ${marker('checkstyle', rule)}\nclass ${name} {}\n`,
    ]),
  );
}

function fixTopic(base, changes, config) {
  vi.stubEnv('XDG_CACHE_HOME', temporaryRoot('nitpicker-fix-cache-'));
  const repository = createGitRepository(base, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, changes);
  const result = fixWorkingTree({
    repositoryRoot: repository.root,
    projectRoot: repository.root,
    baseRef: 'base',
    executeFixCommand: fakeJvmTools().executeFixCommand,
    headPolicy: { exclude: [], conventions: {}, kotlin: { formatter: 'ktlint' } },
    config,
    environment: { NITPICKER_GRADLE: '', NITPICKER_MAVEN: 'fake-mvn' },
    recipes: RECIPES,
    analyzeFixes: (request) => analyzerOf(repository.root)(request),
  });
  return { result, read: (name) => readFileSync(path.join(repository.root, name), 'utf8') };
}

function outcomeOf({ result, read }, directory, extension) {
  const file = (name) => `${directory}/${name}.${extension}`;
  return {
    contents: Object.fromEntries(
      ['Good', 'Adds', 'Breaks', 'Stays'].map((name) => [name, read(file(name))]),
    ),
    fixedFiles: result.fixedFiles,
    fixedFindings: result.fixedFindings,
    notes: result.notes,
  };
}

function expectedOutcome(directory, extension) {
  const file = (name) => `${directory}/${name}.${extension}`;
  const original = sources(directory, extension);
  return {
    contents: {
      Good: '// RESOLVED\nclass Good {}\n',
      Adds: original[file('Adds')],
      Breaks: original[file('Breaks')],
      Stays: original[file('Stays')],
    },
    fixedFiles: [file('Good')],
    fixedFindings: [`${file('Good')}:1 checkstyle/Good (fixes-it)`],
    notes: [
      `--fix left ${file('Stays')}:1 checkstyle/Stays (keeps-it) for a later run: 3 passes did not get to it`,
      `--fix rolled back adds-one (${file('Adds')}): adds checkstyle/Fresh in ${file('Adds')}`,
      `--fix rolled back breaks-build (${file('Breaks')}): breaks the compile or type check: new build/compile-error in ${file('Breaks')}`,
      `--fix rolled back keeps-it (${file('Stays')}): checkstyle/Stays is still reported in ${file('Stays')}`,
    ],
  };
}

describe('--fix verifies the recipes it applied', () => {
  it.each(Object.entries(BUILDS))(
    'rolls back the recipes that make Java worse on %s and keeps the others',
    (_, build) => {
      const run = fixTopic(build, sources(JAVA, 'java'), { preset: 'java' });

      expect(outcomeOf(run, JAVA, 'java')).toEqual(expectedOutcome(JAVA, 'java'));
    },
  );
  it('rolls back the recipes that make Kotlin worse and keeps the others', () => {
    const run = fixTopic(BUILDS.gradle, sources(KT, 'kt'), { preset: 'kotlin' });

    expect(outcomeOf(run, KT, 'kt')).toEqual(expectedOutcome(KT, 'kt'));
  });
  it('verifies nothing when no recipe applied', () => {
    const analyze = vi.fn();
    vi.stubEnv('XDG_CACHE_HOME', temporaryRoot('nitpicker-fix-cache-'));
    const repository = createGitRepository(BUILDS.gradle, { baseRef: 'base' });
    fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
    writeFiles(repository.root, { [`${JAVA}/Plain.java`]: 'class Plain {}\n' });

    fixWorkingTree({
      repositoryRoot: repository.root,
      projectRoot: repository.root,
      baseRef: 'base',
      executeFixCommand: fakeJvmTools().executeFixCommand,
      headPolicy: { exclude: [], conventions: {} },
      config: { preset: 'java' },
      environment: { NITPICKER_GRADLE: '', NITPICKER_MAVEN: 'fake-mvn' },
      recipes: RECIPES,
      analyzeFixes: analyze,
    });

    expect(analyze).not.toHaveBeenCalled();
  });
});
