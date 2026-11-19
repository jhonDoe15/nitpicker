import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { defineRecipes } from '../../../../core/fix/test-support/engine-views.mts';
import type { RecipeSpec } from '../../../../core/fix/test-support/engine-views.mts';
import { fixWorkingTree } from '../../../../core/fix/run-fix.mts';
import { fieldsOf, parseJson } from '../../../../shared/values/readers.mts';
import { fakeJvmTools } from '../test-support/fake-jvm-tools.mts';
import { javaFixOptions } from '../test-support/fix-options.mts';
import { fixCache, topic } from '../test-support/jvm-fix-harness.mts';

const JAVA = 'src/main/java/demo';
const KT = 'src/main/kotlin/demo';
const BUILDS = {
  gradle: { 'build.gradle': "plugins { id 'java' }\n" },
  maven: { 'pom.xml': '<project/>\n' },
};
const MARKER = /QUALITY_FINDING (\{[^}]*\})/gu;
const CHECKSTYLE = 'checkstyle';
const GOOD = 'Good';
const NAMES = [GOOD, 'Adds', 'Breaks', 'Stays'];

type Files = Readonly<Record<string, string>>;
type Run = {
  readonly result: ReturnType<typeof fixWorkingTree>;
  readonly read: (name: string) => string;
};

function marker(tool: string, rule: string): string {
  return `QUALITY_FINDING {"tool":"${tool}","rule":"${rule}"}`;
}

function recipe(id: string, rule: string, replacement: string): RecipeSpec {
  return {
    id,
    rules: [{ tool: CHECKSTYLE, rule }],
    presets: ['java', 'kotlin'],
    scope: 'file',
    safety: 'safe',
    plan: ({ files }) => ({
      fixes: files.flatMap(({ path: name, text }) => {
        const start = text.indexOf(marker(CHECKSTYLE, rule));
        return start === -1
          ? []
          : [
              {
                finding: { tool: CHECKSTYLE, rule, path: name, line: 1 },
                edits: [
                  {
                    type: 'replace',
                    path: name,
                    start,
                    end: start + marker(CHECKSTYLE, rule).length,
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
  recipe('fixes-it', GOOD, 'RESOLVED'),
  recipe('adds-one', 'Adds', marker(CHECKSTYLE, 'Fresh')),
  recipe('breaks-build', 'Breaks', marker('build', 'compile-error')),
  recipe('keeps-it', 'Stays', `RESOLVED ${marker(CHECKSTYLE, 'Stays')}`),
]);

function analyzerOf(root: string) {
  return ({ files }: { readonly files: readonly string[] }) => ({
    findings: files.flatMap((name) =>
      [...readFileSync(path.join(root, name), 'utf8').matchAll(MARKER)].map(([, json]) => ({
        ...fieldsOf(parseJson(json ?? '')),
        path: name,
        classification: 'enforceable',
      })),
    ),
  });
}

function sources(directory: string, extension: string): Files {
  return Object.fromEntries(
    NAMES.map((name) => [
      `${directory}/${name}.${extension}`,
      `// ${marker(CHECKSTYLE, name)}\nclass ${name} {}\n`,
    ]),
  );
}

function fixTopic({
  base,
  changes,
  config,
}: {
  readonly base: Files;
  readonly changes: Files;
  readonly config: object;
}): Run {
  const repository = topic(base, changes);
  const result = fixWorkingTree(
    javaFixOptions({
      root: repository.root,
      cacheHome: fixCache(),
      executeFixCommand: fakeJvmTools().executeFixCommand,
      recipes: RECIPES,
      headPolicy: { exclude: [], conventions: {}, kotlin: { formatter: 'ktlint' } },
      config,
      analyzeFixes: (request: { readonly files: readonly string[] }) =>
        analyzerOf(repository.root)(request),
    }),
  );
  return { result, read: (name) => readFileSync(path.join(repository.root, name), 'utf8') };
}

function outcomeOf({ result, read }: Run, directory: string, extension: string) {
  const file = (name: string) => `${directory}/${name}.${extension}`;
  return {
    contents: Object.fromEntries(NAMES.map((name) => [name, read(file(name))])),
    fixedFiles: result.fixedFiles,
    fixedFindings: result.fixedFindings,
    notes: result.notes,
  };
}

function expectedOutcome(directory: string, extension: string) {
  const file = (name: string) => `${directory}/${name}.${extension}`;
  const original = sources(directory, extension);
  return {
    contents: {
      Good: '// RESOLVED\nclass Good {}\n',
      Adds: original[file('Adds')],
      Breaks: original[file('Breaks')],
      Stays: original[file('Stays')],
    },
    fixedFiles: [file(GOOD)],
    fixedFindings: [`${file(GOOD)}:1 checkstyle/Good (fixes-it)`],
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
      const run = fixTopic({
        base: build,
        changes: sources(JAVA, 'java'),
        config: { preset: 'java' },
      });

      expect(outcomeOf(run, JAVA, 'java')).toEqual(expectedOutcome(JAVA, 'java'));
    },
  );
  it('rolls back the recipes that make Kotlin worse and keeps the others', () => {
    const run = fixTopic({
      base: BUILDS.gradle,
      changes: sources(KT, 'kt'),
      config: { preset: 'kotlin' },
    });

    expect(outcomeOf(run, KT, 'kt')).toEqual(expectedOutcome(KT, 'kt'));
  });
  it('verifies nothing when no recipe applied', () => {
    const analyze = vi.fn();
    const repository = topic(BUILDS.gradle, {
      [`${JAVA}/Plain.java`]: 'class Plain {}\n',
    });

    fixWorkingTree(
      javaFixOptions({
        root: repository.root,
        cacheHome: fixCache(),
        executeFixCommand: fakeJvmTools().executeFixCommand,
        recipes: RECIPES,
        headPolicy: { exclude: [], conventions: {} },
        config: { preset: 'java' },
        analyzeFixes: analyze,
      }),
    );

    expect(analyze).not.toHaveBeenCalled();
  });
});
