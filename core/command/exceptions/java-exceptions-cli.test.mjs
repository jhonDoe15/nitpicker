import { describe, expect, it } from 'vitest';
import { JAVA_TOOLS } from '../../../languages/java/adapters/gradle-presets.mjs';
import { JAVA_NATIVE_RULES, SHARED_EXCEPTION_RULES } from '../../../shared/policy.mjs';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import { useGradleFixtures } from '../java/test-support/java-cli-harness.mjs';

const { gradleRepository, run } = useGradleFixtures(nitpickerCli);

describe('exceptions with "preset": "java"', () => {
  describe('exceptions for structure, CRAP and coverage findings', () => {
    const WIDE_SOURCE = [
      'package demo;',
      '',
      'public final class Wide {',
      '  int sum(int a, int b, int c, int d) {',
      '    return a + b + c + d;',
      '  }',
      '}',
      '',
    ].join('\n');
    const structure = `${JSON.stringify([
      {
        file: 'src/main/java/demo/Wide.java',
        name: 'Wide.sum',
        start: 4,
        end: 6,
        lines: 3,
        statements: 1,
        maxControlNesting: 0,
        parameters: 4,
        complexity: 1,
        signature: 'Wide.sum(int, int, int, int)',
      },
    ])}\n`;
    const jacoco =
      '<report name="demo"><package name="demo"><class name="demo/Wide" sourcefilename="Wide.java"><method name="sum" desc="(IIII)I" line="4"><counter type="LINE" missed="0" covered="3"/></method></class><sourcefile name="Wide.java"><line nr="4" mi="0" ci="3"/><counter type="LINE" missed="0" covered="3"/></sourcefile></package></report>';
    const configWith = (...exceptions) => `${JSON.stringify({ preset: 'java', exceptions })}\n`;
    const entry = (functionName, rule = 'function-parameters-limit') => ({
      rule,
      paths: ['src/main/java/demo/Wide.java'],
      ...(functionName === undefined ? {} : { function: functionName }),
      reason: 'A reviewed reason.',
    });
    const change = (config) => {
      const root = gradleRepository();
      writeFiles(root, {
        'nitpicker.config.json': config,
        'src/main/java/demo/Wide.java': WIDE_SOURCE,
        'structure.json': structure,
        'jacoco.xml': jacoco,
      });
      commit(root, 'add a wide method');
      return run(root, [], { subprocess: true });
    };

    it('names the entry that accepts a method over the parameter limit', () => {
      const result = change('{ "preset": "java" }\n');

      expect(result.exitCode, result.output.out + result.output.err).toBe(1);
      expect(
        result
          .json('new-findings.json')
          .filter(({ classification }) => classification === 'enforceable')
          .map(({ symbol, message }) => [symbol, message]),
      ).toEqual([
        [
          'Wide.sum',
          'Wide.sum has 4 parameters; limit is 3. If a reviewer agrees this is intended, add {"rule":"function-parameters-limit","paths":["src/main/java/demo/Wide.java"],"function":"Wide.sum","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
        ],
      ]);
    });

    it.each([
      ['the method', 'Wide.sum', 0],
      ['the path', undefined, 0],
      ['another method', 'product', 1],
    ])('lifts the finding by %s only as far as the entry reaches', (_, functionName, exitCode) => {
      expect(change(configWith(entry(functionName))).exitCode).toBe(exitCode);
    });

    it('rejects an exception for a rule outside structure, CRAP and coverage', () => {
      const result = change(configWith(entry(undefined, 'UnusedPrivateField')));

      expect(result.exitCode).toBe(2);
      expect(result.output.err).toBe(
        `nitpicker failed: nitpicker.config.json: "exceptions[0].rule" must name a finding as it is printed, "<tool>/<rule>" (for example "pmd/SpringConstructorInjection"), or one of ${SHARED_EXCEPTION_RULES.filter((rule) => !JAVA_NATIVE_RULES.includes(rule)).join(', ')}. Tools: ${JAVA_TOOLS.join(', ')}\n`,
      );
    });
  });
});
