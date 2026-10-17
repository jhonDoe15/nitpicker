import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { validateKotlinOptions } from '../kotlin-options.mjs';
import { applyKotlinRuleMessages, KOTLIN_LISTED_RULES } from './kotlin-messages.mjs';

const file = 'src/main/kotlin/demo/A.kt';
const finding = (tool, rule, message, classification = 'enforceable') => ({
  tool,
  rule,
  path: file,
  identity: 'id',
  message,
  classification,
});

describe('applyKotlinRuleMessages', () => {
  it('ends every enforceable Kotlin finding with the shared exception sentence for the rule it prints', () => {
    const [detekt, oneWay, scanned, compiler] = applyKotlinRuleMessages([
      finding('detekt', 'detekt.style.MagicNumber', 'This expression contains a magic number.'),
      finding('detekt', 'detekt.style.UnnecessaryLet', 'let expression can be omitted'),
      finding('kotlin-source', 'MutableModuleState', 'Keep state in an instance.'),
      finding('kotlinc', 'unchecked', 'Unchecked cast.'),
    ]);

    expect(detekt.message).toBe(
      `This expression contains a magic number. ${exceptionHint('detekt.style.MagicNumber', file)}`,
    );
    expect(oneWay.message).toBe(
      `let expression can be omitted. Call the member directly; \`let\` is for \`value?.let { ... }\`. ${exceptionHint('detekt.style.UnnecessaryLet', file)}`,
    );
    expect(scanned.message).toBe(
      `Keep state in an instance. ${exceptionHint('kotlin-source/MutableModuleState', file)}`,
    );
    expect(compiler.message).toBe(`Unchecked cast. ${exceptionHint('kotlinc/unchecked', file)}`);
  });

  it('leaves descriptive findings, other tools and messages that already give a route alone', () => {
    const findings = [
      finding('detekt', 'detekt.style.MagicNumber', 'magic', 'descriptive'),
      finding('ktlint', 'ktlint.standard.indent', 'indent'),
      finding(
        'detekt',
        'inline-suppression',
        'Lift it with "exceptions" in nitpicker.config.json.',
      ),
    ];

    expect(applyKotlinRuleMessages(findings)).toEqual(findings);
  });

  it('routes only to rules that nitpicker.config.json accepts as exceptions', () => {
    for (const rule of ['detekt.style.MagicNumber', ...KOTLIN_LISTED_RULES]) {
      const config = { preset: 'kotlin', exceptions: [{ rule, paths: [file], reason: 'r' }] };

      expect(() => {
        validateKotlinOptions(config);
      }, rule).not.toThrow();
    }
  });
});

describe('Kotlin finding messages', () => {
  const kotlinRoot = path.resolve(import.meta.dirname, '..');
  const HAND_WRITTEN_ROUTE =
    /add an exception for|"exceptions" entry for|If it is right here|To allow it here|to "exceptions" in nitpicker/u;
  const SUPPRESSIONS = 'rules/kotlin-suppressions.mjs';

  it('get their exception route only from the shared sentence, except for the suppression of a rule', () => {
    const sources = readdirSync(kotlinRoot, { recursive: true })
      .map((entry) => entry.replaceAll('\\', '/'))
      .filter(
        (entry) =>
          entry.endsWith('.mjs') && !entry.includes('.test.') && !entry.includes('test-support/'),
      );
    const handWritten = sources
      .filter((entry) => entry !== SUPPRESSIONS)
      .filter((entry) =>
        HAND_WRITTEN_ROUTE.test(readFileSync(path.join(kotlinRoot, entry), 'utf8')),
      );

    expect(handWritten).toEqual([]);
    expect(HAND_WRITTEN_ROUTE.test(readFileSync(path.join(kotlinRoot, SUPPRESSIONS), 'utf8'))).toBe(
      true,
    );
  });
});
