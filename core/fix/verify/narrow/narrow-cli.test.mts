import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../../cli.mts';
import { fakeAnalyzer, useCliFixtures } from '../../../command/test-support/cli-harness.mts';
import { policy } from '../../../diff/execution/test-support/analyzer-findings.mts';
import { writeFiles } from '../../../diff/git/test-support/fixture-files.mts';
import { captureOutput } from '../../../diff/reporting/test-support/output-capture.mts';
import { defineRecipes } from '../../test-support/engine-views.mts';
import type { PlanContext, RecipeSpec } from '../../test-support/engine-views.mts';
import { fakeJvmTools } from '../../test-support/tool-views.mts';
import type { FixCliInput } from '../../test-support/tool-views.mts';

const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);

const NAME = 'src/main/java/demo/Mixed.java';
const RULES = ['First', 'Worse', 'Last'];

function marker(tool: string, rule: string) {
  return `QUALITY_FINDING ${JSON.stringify({ tool, rule, identity: rule, message: rule, classification: 'enforceable' })}`;
}

function replacementOf(rule: string) {
  return rule === 'Worse' ? marker('checkstyle', 'Added') : 'RESOLVED';
}

const MIXED: RecipeSpec = {
  id: 'mixed',
  rules: RULES.map((rule) => ({ tool: 'checkstyle', rule })),
  presets: ['java'],
  scope: 'file',
  safety: 'safe',
  plan: ({ files }: PlanContext) => ({
    fixes: files.flatMap(({ path: name, text }) =>
      RULES.filter((rule) => text.includes(marker('checkstyle', rule))).map((rule) => {
        const start = text.indexOf(marker('checkstyle', rule));
        return {
          finding: {
            tool: 'checkstyle',
            rule,
            path: name,
            line: text.slice(0, start).split('\n').length,
          },
          edits: [
            {
              type: 'replace',
              path: name,
              start,
              end: start + marker('checkstyle', rule).length,
              text: replacementOf(rule),
            },
          ],
        };
      }),
    ),
  }),
};

function sourceWith(comments: readonly string[], indent = '  ') {
  const [first = '', worse = '', last = ''] = comments;
  const body = ['int a;', 'int b;', `// ${worse}`, 'int c;', 'int d;', `// ${last}`];
  return `// ${first}\nclass Mixed {\n${body.map((line) => `${indent}${line}\n`).join('')}}\n`;
}

function fix() {
  const created = createRepository({
    'nitpicker.config.json': '{ "preset": "java" }\n',
    'build.gradle': "plugins { id 'java' }\n",
    'quality-policy.json': policy(),
  });
  writeFiles(created.root, {
    [NAME]: sourceWith(RULES.map((rule) => marker('checkstyle', rule))),
  });
  const output = captureOutput();
  const input: FixCliInput = {
    arguments_: ['--fix', '--base', created.baseRef, '--output', makeOutputRoot()],
    currentProjectRoot: created.root,
    environment: { NITPICKER_CACHE_DIR: makeTemporaryRoot('nitpicker-cli-cache-') },
    analyzers: [{ ...fakeAnalyzer(), reportedTools: ['checkstyle'] }],
    executeFixCommand: fakeJvmTools().executeFixCommand,
    fixRecipes: defineRecipes([MIXED]),
    stdout: output.stdout,
    stderr: output.stderr,
  };
  runCli(input);
  const stdout = output.stdoutText;
  return {
    text: readFileSync(path.join(created.root, NAME), 'utf8'),
    summary: stdout.slice(0, stdout.indexOf('Base: ')),
  };
}

describe('nitpicker --fix with one fix that adds a finding', () => {
  it('leaves that fix out and keeps the other fixes of the file', () => {
    const { text, summary } = fix();

    expect(text).toBe(sourceWith(['RESOLVED', marker('checkstyle', 'Worse'), 'RESOLVED'], ' '));
    expect(summary).toBe(
      `Fixed files:\n${NAME}\nFixed findings:\n  ${NAME}:1 checkstyle/First (mixed)\n  ${NAME}:8 checkstyle/Last (mixed)\n` +
        `Fix notes:\n  google-java-format rewrote ${NAME}\n  --fix left out the fix of ${NAME}:5 checkstyle/Worse and kept the other fixes of the file: adds checkstyle/Added in ${NAME}\n`,
    );
  });
});
