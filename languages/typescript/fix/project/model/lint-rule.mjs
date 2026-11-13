import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../../preset/eslint-plugin/index.mjs';

function offsetOf(text, line, column) {
  const starts = [0, ...Array.from(text.matchAll(/\n/gu), (match) => match.index + 1)];
  return (starts[line - 1] ?? text.length) + column - 1;
}

function configFor(project, { ruleId, options, typed }) {
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

export function lintRule(project, name, { ruleId, options = [], typed = false }) {
  const text = project.read(name);
  const linter = new Linter({ cwd: project.projectRoot });
  return linter
    .verify(text, configFor(project, { ruleId, options, typed }), {
      filename: project.absolute(name),
    })
    .filter((message) => message.ruleId === `nitpicker/${ruleId}`)
    .map((message) => ({
      messageId: message.messageId,
      message: message.message,
      line: message.line,
      start: offsetOf(text, message.line, message.column),
      end:
        message.endLine === undefined
          ? undefined
          : offsetOf(text, message.endLine, message.endColumn),
    }));
}
