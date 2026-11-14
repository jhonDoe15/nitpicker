import { type ESLint, Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../../preset/eslint-plugin/index.mjs';
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

function isPlugin(value: unknown): value is ESLint.Plugin {
  return typeof value === 'object' && value !== null && 'rules' in value;
}

function nitpickerPlugin(): ESLint.Plugin {
  const plugin: unknown = nitpickerRules;
  if (!isPlugin(plugin)) {
    throw new TypeError('The nitpicker ESLint plugin does not load');
  }
  return plugin;
}

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
      plugins: { nitpicker: nitpickerPlugin() },
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
