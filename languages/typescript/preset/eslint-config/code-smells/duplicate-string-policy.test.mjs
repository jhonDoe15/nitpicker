import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ESLint, Linter } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { exceptionSentence } from '../../../../../shared/messages/exception-sentence.mjs';
import { normalizeEslintResults } from '../../../adapters/eslint/normalize.mjs';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import { applyRuleExceptions } from '../exceptions.mjs';
import { codeSmellProductionRules } from './code-smell-rules.mjs';

const RULE = 'nitpicker/no-duplicate-string-literals';
const FILE = 'src/main/features/orders/domain/labels.ts';
const CODE = 'export const labels = ["pending", "pending", "pending"];\n';
const packageRoot = path.resolve(import.meta.dirname, '../../../../..');
const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

async function severityFor(file) {
  const eslint = new ESLint({
    cwd: packageRoot,
    overrideConfigFile: path.join(
      packageRoot,
      'languages/typescript/preset/defaults/eslint.config.mjs',
    ),
  });
  const calculated = await eslint.calculateConfigForFile(path.join(packageRoot, file));
  const setting = calculated?.rules?.[RULE];
  return Array.isArray(setting) ? setting[0] : setting;
}

function messagesFor(filename, exceptions = []) {
  const config = applyRuleExceptions(
    [
      {
        files: ['**/*.ts'],
        plugins: { nitpicker: nitpickerRules },
        rules: codeSmellProductionRules,
      },
    ],
    exceptions,
  );
  return new Linter().verify(CODE, config, { filename }).filter(({ ruleId }) => ruleId === RULE);
}

function findingsFor(code) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-repeated-strings-'));
  temporaryRoots.push(root);
  const file = path.join(root, FILE);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, code);
  const config = [
    { files: ['**/*.ts'], plugins: { nitpicker: nitpickerRules }, rules: { [RULE]: 'error' } },
  ];
  const messages = new Linter().verify(code, config, { filename: FILE });
  return normalizeEslintResults({
    value: [{ filePath: file, messages }],
    projectRoot: root,
    analyzerName: 'eslint-lint',
  });
}

describe('no-duplicate-string-literals in the production policy', () => {
  it.each(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'])('is on for a .%s source', async (extension) => {
    expect(await severityFor(`src/main/features/orders/adapters/store.${extension}`)).toBe(2);
  });

  it.each(['test/orders.test.ts', 'src/main/features/orders/store.test.ts'])(
    'is off for the test path %s',
    async (file) => {
      expect(await severityFor(file)).toBeUndefined();
    },
  );

  it('lifts only the path its exception names', () => {
    const exceptions = [{ rule: RULE, paths: [FILE], reason: 'These labels are independent.' }];

    expect({
      excepted: messagesFor(FILE, exceptions).length,
      other: messagesFor(FILE.replace('labels', 'states'), exceptions).length,
    }).toEqual({ excepted: 0, other: 1 });
  });

  it('keeps its identity when the lines move and reports a new third use', () => {
    const headFindings = findingsFor(`\n\n${CODE}`);

    expect({
      moved: compareFindings({ baseFindings: findingsFor(CODE), headFindings }).newFindings,
      line: headFindings[0].location.line,
      added: compareFindings({
        baseFindings: findingsFor(CODE.replace(', "pending"', '')),
        headFindings,
      }).newFindings.map(({ rule }) => rule),
    }).toEqual({ moved: [], line: 3, added: [RULE] });
  });

  it('ends its final message with the shared exception route exactly once', () => {
    const [finding] = findingsFor(CODE);
    const route = exceptionSentence(`{"rule":"${RULE}","paths":["${FILE}"],"reason":"..."}`);

    expect({
      endsWithRoute: finding.message.endsWith(route),
      routes: finding.message.split('to "exceptions" in nitpicker.config.json').length - 1,
    }).toEqual({ endsWithRoute: true, routes: 1 });
  });
});
