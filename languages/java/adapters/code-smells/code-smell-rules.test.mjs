import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../java-analyzer.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { writePmdRulesets } from '../../builds/rulesets/pmd-rulesets.mjs';
import { expectedViolations } from '../test-support/violation-markers.mjs';
import { codeSmellRules } from '../test-support/code-smell-rules.mjs';
import { withRuleMessage } from '../../messages/rule-messages.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { GENERIC_NAME_WORDS, LOG_LEVEL_METHODS } from '../../../../shared/naming/smell-words.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const fixture = path.join(import.meta.dirname, '..', 'fixtures', 'code-smells-project', 'src');
const rules = codeSmellRules();
const ruleset = readFileSync(
  path.join(packageRoot, 'languages/java/gradle/code-smells-ruleset.xml'),
  'utf8',
);

function ruleText(name) {
  const start = ruleset.indexOf(`<rule name="${name}"`);
  return ruleset.slice(start, ruleset.indexOf('</rule>', start));
}

function markedRules(sourceSet) {
  return new Set(
    expectedViolations(path.join(fixture, sourceSet, 'java')).map((line) => line.split(' ')[1]),
  );
}

describe('the Java code smell ruleset', () => {
  it('has the rules the docs list', () => {
    const docs = readFileSync(path.join(packageRoot, 'docs', 'java-preset.md'), 'utf8');
    expect(rules.map(({ name }) => name).filter((name) => !docs.includes(`\`${name}\``))).toEqual(
      [],
    );
  });

  it.each(rules)(
    '$name gets the shared exception route and writes none itself',
    ({ name, message }) => {
      const file = 'src/main/java/demo/A.java';
      const hint = exceptionHint(`pmd/${name}`, file);
      const routed = withRuleMessage({
        tool: 'pmd',
        rule: name,
        path: file,
        message,
        classification: 'enforceable',
      }).message;

      expect([message.includes('nitpicker.config.json'), routed.slice(-hint.length - 1)]).toEqual([
        false,
        ` ${hint}`,
      ]);
    },
  );

  it('names the log levels and generic names the TypeScript rules use', () => {
    const levels = `@MethodName = (${LOG_LEVEL_METHODS.map((name) => `'${name}'`).join(', ')})`;
    const typeWords = GENERIC_NAME_WORDS.map((word) => word[0].toUpperCase() + word.slice(1));

    expect({
      catch: ruleText('CatchOnlyLogsOrReturnsDefault').includes(levels),
      type: ruleText('GenericTypeName').split(`(${typeWords.join('|')})$`).length,
      package: ruleText('GenericPackageName').includes(`(${GENERIC_NAME_WORDS.join('|')})(`),
    }).toEqual({ catch: true, type: 3, package: true });
  });

  it.each(rules)('$name has a marked violation in the fixture', ({ name }) => {
    expect(markedRules('main').has(name)).toBe(true);
  });

  it('marks the test-source rules in the fixture tests', () => {
    expect([...markedRules('test')].sort()).toEqual([
      'AvoidDuplicateLiterals',
      'UnusedFormalParameter',
    ]);
  });

  it('ships both rulesets and scopes them in the PMD rulesets both builds run', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-code-smell-wiring-'));
    const test = path.join(root, 'src/test/java');
    mkdirSync(test, { recursive: true });
    const reportDir = path.join(root, 'report');
    const rulesets = writePmdRulesets({
      reportDir,
      mainDirectories: [path.join(root, 'src/main/java')],
      testDirectories: [test],
      compiler: { target: '21', args: [] },
      spring: false,
      nitpicker: true,
      project: undefined,
    });
    const wrapperOf = (file) =>
      rulesets
        .filter((ruleset) => ruleset.startsWith(reportDir))
        .map((ruleset) => readFileSync(ruleset, 'utf8'))
        .find((text) => text.includes(path.join(GRADLE_DIRECTORY, file)));
    const script = readFileSync(
      path.join(packageRoot, 'languages/java/gradle/tasks/analysis/pmd-task.gradle'),
      'utf8',
    );
    const maven = readFileSync(
      path.join(packageRoot, 'languages/java/maven/guards/maven-pmd.mjs'),
      'utf8',
    );
    const shipped = ['code-smells-ruleset.xml', 'code-smells-test-ruleset.xml'];
    const wiring = {
      main: wrapperOf(shipped[0]).includes(`<exclude-pattern>${test}/.*</exclude-pattern>`),
      test: wrapperOf(shipped[1]).includes(`<include-pattern>${test}/.*</include-pattern>`),
      gradle: script.includes("writeRules('pmd', plan)"),
      maven: maven.includes("from '../../builds/rulesets/pmd-rulesets.mjs'"),
      shipped: shipped.filter((file) =>
        configurationFiles().includes(`languages/java/gradle/${file}`),
      ),
    };
    rmSync(root, { recursive: true, force: true });

    expect(wiring).toEqual({ main: true, test: true, gradle: true, maven: true, shipped });
  });
});
