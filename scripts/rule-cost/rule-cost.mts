import { globSync } from 'node:fs';
import path from 'node:path';
import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../languages/typescript/preset/eslint-plugin/index.mts';
import { ruleCosts, ruleTimes, unexpectedCosts } from './costly-rules.mts';

const toolRoot = path.resolve(import.meta.dirname, '../..');
const SOURCES = '{core,shared,languages/typescript}/**/*.mts';
const SKIPPED = /(?:^|\/)(?:fixtures|node_modules)\//u;
const DEFAULT_FILES = 400;
const LISTED = 15;
const KNOWN_COSTLY = new Map([
  ['nitpicker/no-decided-condition', 'asks the solver about each condition'],
  [
    'nitpicker/no-presence-truthiness',
    'resolves, once per program, the calls and writes that pass an empty string, 0 or false',
  ],
  [
    'nitpicker/hover-test-needs-keyboard',
    'the first React test rule on a file follows its imports to find test helpers; the others reuse that',
  ],
]);

function sampledFiles(count: number): string[] {
  const files = globSync(SOURCES, { cwd: toolRoot })
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => !SKIPPED.test(file))
    .toSorted((first, second) => first.localeCompare(second));
  const step = Math.max(1, Math.floor(files.length / count));
  return files.filter((_, index) => index % step === 0).slice(0, count);
}

function ownRulesConfig(): Linter.Config[] {
  const parser: Linter.Parser = tseslint.parser;
  const plugin: ESLint.Plugin = nitpickerRules;
  return [
    {
      files: ['**/*.mts'],
      languageOptions: {
        parser,
        parserOptions: { project: './tsconfig.json', tsconfigRootDir: toolRoot },
      },
      plugins: { nitpicker: plugin },
      rules: Object.fromEntries(
        Object.keys(nitpickerRules.rules).map((rule) => [`nitpicker/${rule}`, 'error']),
      ),
    },
  ];
}

async function main(requested: string | undefined): Promise<number> {
  const files = sampledFiles(Number(requested ?? DEFAULT_FILES));
  const eslint = new ESLint({
    cwd: toolRoot,
    overrideConfigFile: true,
    overrideConfig: ownRulesConfig(),
    stats: true,
  });
  const costs = ruleCosts(ruleTimes(await eslint.lintFiles(files)));
  const lines = costs
    .slice(0, LISTED)
    .map(
      ({ rule, ms, timesMean, costly }) =>
        `${String(Math.round(ms)).padStart(8)} ms  ${timesMean.toFixed(1).padStart(6)}x  ${rule}${costly ? `  (costly: ${KNOWN_COSTLY.get(rule) ?? 'not expected'})` : ''}`,
    );
  const unexpected = unexpectedCosts(costs, new Set(KNOWN_COSTLY.keys()));
  process.stdout.write(
    [
      `Rule time over ${String(files.length)} files, ${String(costs.length)} rules; x = times the mean rule:`,
      ...lines,
      unexpected.length === 0
        ? 'No rule outside the known costly ones takes fifteen times the mean.'
        : `Fifteen times the mean or more: ${unexpected.map(({ rule }) => rule).join(', ')}. ` +
          'Make the rule cheaper, or add it to KNOWN_COSTLY in scripts/rule-cost/rule-cost.mts with the reason in the pull request.',
      '',
    ].join('\n'),
  );
  return unexpected.length === 0 ? 0 : 1;
}

process.exitCode = await main(process.argv[2]);
