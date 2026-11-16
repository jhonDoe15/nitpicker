import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../../preset/eslint-plugin/index.mts';
import type { LintMessage, Project } from '../typed/project-types.mts';

export type LintSettings = {
  readonly ruleId: string;
  readonly options?: readonly unknown[];
  readonly typed?: true | undefined;
};

type LintConfig = {
  readonly ruleId: string;
  readonly options: readonly unknown[];
  readonly typed: boolean;
};

function offsetOf(text: string, line: number, column: number): number {
  const starts = [0, ...Array.from(text.matchAll(/\n/gu), (match) => match.index + 1)];
  return (starts[line - 1] ?? text.length) + column - 1;
}

function configFor(project: Project, { ruleId, options, typed }: LintConfig): Linter.Config[] {
  return [
    {
      files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
      languageOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
        ecmaVersion: 'latest',
        parserOptions: typed ? { programs: [project.program] } : {},
      },
      linterOptions: { reportUnusedDisableDirectives: 'off' },
      plugins: { nitpicker: nitpickerRules },
      rules: { [`nitpicker/${ruleId}`]: ['error', ...options] },
    },
  ];
}

export function lintRule(
  project: Project,
  name: string,
  { ruleId, options = [], typed }: LintSettings,
): LintMessage[] {
  const text = project.read(name) ?? '';
  const linter = new Linter({ cwd: project.projectRoot });
  return linter
    .verify(text, configFor(project, { ruleId, options, typed: typed === true }), {
      filename: project.absolute(name),
    })
    .filter((message) => message.ruleId === `nitpicker/${ruleId}`)
    .map((message) => ({
      messageId: message.messageId,
      message: message.message,
      line: message.line,
      start: offsetOf(text, message.line, message.column),
      end:
        message.endLine === undefined || message.endColumn === undefined
          ? undefined
          : offsetOf(text, message.endLine, message.endColumn),
    }));
}
