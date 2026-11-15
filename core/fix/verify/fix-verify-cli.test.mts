import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import { fakeAnalyzer, useCliFixtures } from '../../command/test-support/cli-harness.mts';
import { policy } from '../../diff/execution/test-support/analyzer-findings.mts';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mts';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mts';
import { defineRecipes } from '../test-support/engine-views.mts';
import type { PlanContext, RecipeSpec } from '../test-support/engine-views.mts';
import { fakeJvmTools } from '../test-support/tool-views.mts';
import type { FixCliInput } from '../test-support/tool-views.mts';
import type {
  FixtureAnalyzer,
  FixtureRepository,
} from '../../command/test-support/fixture-types.mts';
import { fieldAt } from '../../../scripts/json/fields.mts';
import { fieldOf, listOf, parseJson } from '../../../shared/values/readers.mts';

const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);

const JAVA = 'src/main/java/demo';

function marker(tool: string, rule: string) {
  return `QUALITY_FINDING ${JSON.stringify({ tool, rule, identity: rule, message: rule, classification: 'enforceable' })}`;
}

function recipe(id: string, rule: string, replacement: string): RecipeSpec {
  const target = marker('checkstyle', rule);
  return {
    id,
    rules: [{ tool: 'checkstyle', rule }],
    presets: ['java'],
    scope: 'file',
    safety: 'safe',
    plan: ({ files }: PlanContext) => ({
      fixes: files
        .filter(({ text }) => text.includes(target))
        .map(({ path: name, text }) => ({
          finding: { tool: 'checkstyle', rule, path: name, line: 1 },
          edits: [
            {
              type: 'replace',
              path: name,
              start: text.indexOf(target),
              end: text.indexOf(target) + target.length,
              text: replacement,
            },
          ],
        })),
    }),
  };
}

const RECIPES = defineRecipes([
  recipe('fixes-it', 'Good', 'RESOLVED'),
  recipe('breaks-build', 'Breaks', marker('build', 'compile-error')),
]);

function analyzer() {
  return { ...fakeAnalyzer(), reportedTools: ['checkstyle', 'build'] };
}

function repository() {
  const created = createRepository({
    'nitpicker.config.json': '{ "preset": "java" }\n',
    'build.gradle': "plugins { id 'java' }\n",
    'quality-policy.json': policy(),
  });
  writeFiles(created.root, {
    [`${JAVA}/Good.java`]: `// ${marker('checkstyle', 'Good')}\nclass Good {}\n`,
    [`${JAVA}/Breaks.java`]: `// ${marker('checkstyle', 'Breaks')}\nclass Breaks {}\n`,
  });
  return created;
}

function run(
  created: FixtureRepository,
  extra: readonly string[],
  analyzers: readonly FixtureAnalyzer[] = [analyzer()],
) {
  const output = captureOutput();
  const outputRoot = makeOutputRoot();
  const input: FixCliInput = {
    arguments_: [...extra, '--base', created.baseRef, '--output', outputRoot],
    currentProjectRoot: created.root,
    environment: { NITPICKER_CACHE_DIR: makeTemporaryRoot('nitpicker-cli-cache-') },
    analyzers,
    executeFixCommand: fakeJvmTools().executeFixCommand,
    fixRecipes: RECIPES,
    stdout: output.stdout,
    stderr: output.stderr,
  };
  const exitCode = runCli(input);
  return { exitCode, stdout: output.stdoutText, stderr: output.stderrText, outputRoot };
}

function read(created: FixtureRepository, name: string) {
  return readFileSync(path.join(created.root, `${JAVA}/${name}`), 'utf8');
}

const NOTE =
  `--fix rolled back breaks-build (${JAVA}/Breaks.java): ` +
  `breaks the compile or type check: new build/compile-error in ${JAVA}/Breaks.java`;

function summaryOf(stdout: string) {
  return stdout.slice(0, stdout.indexOf('Base: '));
}

function sources(created: FixtureRepository) {
  return { good: read(created, 'Good.java'), breaks: read(created, 'Breaks.java') };
}

const GOOD_FIXED = '// RESOLVED\nclass Good {}\n';
const BREAKS_KEPT = `// ${marker('checkstyle', 'Breaks')}\nclass Breaks {}\n`;
const FIXED_LINES = `Fixed files:\n${JAVA}/Good.java\nFixed findings:\n  ${JAVA}/Good.java:1 checkstyle/Good (fixes-it)\n`;

describe('nitpicker --fix verification', () => {
  it.each([['narrow'], ['full']])(
    'rolls back the recipe that breaks the build with --verify %s',
    (mode) => {
      const created = repository();

      const { stdout } = run(created, ['--fix', '--verify', mode]);

      expect(sources(created)).toEqual({ good: GOOD_FIXED, breaks: BREAKS_KEPT });
      expect(summaryOf(stdout)).toBe(`${FIXED_LINES}Fix notes:\n  ${NOTE}\n`);
    },
  );
  it('keeps the rolled back recipe out of the plan of a dry run and changes no file', () => {
    const created = repository();

    const { stdout, outputRoot } = run(created, ['--fix', '--dry-run']);

    const fixes = listOf(
      fieldAt(parseJson(readFileSync(path.join(outputRoot, 'fixes.json'), 'utf8')), 'fixes'),
    );
    expect(fixes.map((fix) => fieldOf(fix, 'recipe'))).toEqual(['fixes-it']);
    expect(summaryOf(stdout).replaceAll(outputRoot, '<output>')).toBe(
      `Fixes that --fix would apply (dry run, nothing was written to your files): 1
  ${JAVA}/Good.java:1 checkstyle/Good (fixes-it, safe)
Patch: <output>/fix.patch
Fixes: <output>/fixes.json
Fix notes (from the dry run):
  ${NOTE}
`,
    );
    expect(sources(created).good).toBe(`// ${marker('checkstyle', 'Good')}\nclass Good {}\n`);
  });
  it('keeps every fix and says so when no analyzer reports the fixed rules', () => {
    const created = repository();

    const { stdout } = run(created, ['--fix'], [fakeAnalyzer()]);

    expect(sources(created).breaks).toBe(
      `// ${marker('build', 'compile-error')}\nclass Breaks {}\n`,
    );
    expect(summaryOf(stdout)).toBe(
      `Fixed files:
${JAVA}/Breaks.java
${JAVA}/Good.java
Fixed findings:
  ${JAVA}/Good.java:1 checkstyle/Good (fixes-it)
  ${JAVA}/Breaks.java:1 checkstyle/Breaks (breaks-build)
Fix notes:
  --fix could not verify the fixes: no analyzer reports the fixed rules
`,
    );
  });
  it('refuses --verify without --fix and an unknown mode', () => {
    expect(run(repository(), ['--verify', 'full']).stderr).toBe(
      'nitpicker failed: --verify only works with --fix: use nitpicker --fix --verify full\n',
    );
    expect(run(repository(), ['--fix', '--verify', 'all']).stderr).toBe(
      'nitpicker failed: --verify takes narrow or full, not all\n',
    );
  });
});
