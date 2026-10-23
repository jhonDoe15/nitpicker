import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../java-analyzer.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { writePmdRulesets } from '../../builds/rulesets/pmd-rulesets.mjs';
import { expectedViolations } from '../test-support/code-smells/violation-markers.mjs';
import { codeSmellRules } from '../test-support/code-smells/code-smell-rules.mjs';
import { withRuleMessage } from '../../messages/rule-messages.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import {
  ACCEPTED_MANAGER_ROLES,
  CONTAINER_NAME_WORDS,
  GENERIC_NAME_WORDS,
  LOG_LEVEL_METHODS,
} from '../../../../shared/naming/smell-words.mjs';
import { DISCRIMINANT_KEYS } from '../../../typescript/preset/eslint-plugin/rules/code-smells/duplicate-string-literals.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const fixture = path.join(import.meta.dirname, '..', 'fixtures', 'code-smells-project', 'src');
const rules = codeSmellRules();
const ruleset = readFileSync(
  path.join(packageRoot, 'languages/java/gradle/code-smells-ruleset.xml'),
  'utf8',
);

const springRuleset = readFileSync(
  path.join(packageRoot, 'languages/java/gradle/spring-ruleset.xml'),
  'utf8',
);

function ruleText(name, text = ruleset) {
  const start = text.indexOf(`<rule name="${name}"`);
  return text.slice(start, text.indexOf('</rule>', start));
}

function xpathOf(name, text) {
  const rule = ruleText(name, text);
  const xpath = rule.slice(rule.indexOf('<![CDATA[') + 9, rule.indexOf(']]>'));
  return xpath.replaceAll(/\s+/g, ' ').trim();
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

  it('names the log levels the TypeScript rules use', () => {
    const levels = `@MethodName = (${LOG_LEVEL_METHODS.map((name) => `'${name}'`).join(', ')})`;

    expect(ruleText('CatchOnlyLogsOrReturnsDefault').includes(levels)).toBe(true);
  });

  it.each(['GenericTypeName', 'GenericPackageName'])(
    '%s reads the generic, container and manager role words every preset shares',
    (name) => {
      const xpath = xpathOf(name);
      const listed = (variable) =>
        new RegExp(`\\$${variable} := \\(([^)]*)\\)`)
          .exec(xpath)?.[1]
          .split(', ')
          .map((word) => word.slice(1, -1));

      expect({
        generic: listed('generic'),
        containers: listed('containers'),
        roles: listed('roles'),
      }).toEqual({
        generic: GENERIC_NAME_WORDS,
        containers: CONTAINER_NAME_WORDS,
        roles: ACCEPTED_MANAGER_ROLES,
      });
    },
  );

  it('skips the discriminant values the TypeScript rule skips, after a map key', () => {
    const xpath = xpathOf('RepeatedStringLiteral');
    const listed = /\[self::StringLiteral\]\/@ConstValue = \(([^)]*)\)/.exec(xpath)[1];

    expect(listed.split(', ').map((word) => word.slice(1, -1))).toEqual([...DISCRIMINANT_KEYS]);
  });

  it('leaves to the Spring rules exactly the writes and flushes they report', () => {
    const ioCallInLoop = xpathOf('IoCallInLoop');
    const flushes = xpathOf('SpringDataNoFlush', springRuleset);

    expect({
      writes: ioCallInLoop.includes(xpathOf('SpringDataNoSaveInLoop', springRuleset)),
      flushes: ioCallInLoop.includes(flushes.slice(0, flushes.indexOf(' [not('))),
    }).toEqual({ writes: true, flushes: true });
  });

  it.each(rules)('$name has a marked violation in the fixture', ({ name }) => {
    expect(markedRules('main').has(name)).toBe(true);
  });

  it('marks the test-source rules in the fixture tests', () => {
    expect([...markedRules('test')].sort()).toEqual(['UnusedFormalParameter']);
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
    const gradleFile = (file) =>
      readFileSync(path.join(packageRoot, 'languages/java/gradle', file), 'utf8');
    const maven = readFileSync(
      path.join(packageRoot, 'languages/java/maven/maven-lint.mjs'),
      'utf8',
    );
    const shipped = ['code-smells-ruleset.xml', 'code-smells-test-ruleset.xml'];
    const wiring = {
      main: wrapperOf(shipped[0]).includes(`<exclude-pattern>${test}/.*</exclude-pattern>`),
      test: wrapperOf(shipped[1]).includes(`<include-pattern>${test}/.*</include-pattern>`),
      gradle: gradleFile('nitpicker.init.gradle').includes("writeRules('pmd-guards', guardsPlan)"),
      maven: maven.includes(
        "import { writeGuardRulesets } from '../builds/rulesets/pmd-rulesets.mjs'",
      ),
      shipped: shipped.filter((file) =>
        configurationFiles().includes(`languages/java/gradle/${file}`),
      ),
    };
    rmSync(root, { recursive: true, force: true });

    expect(wiring).toEqual({ main: true, test: true, gradle: true, maven: true, shipped });
  });
});
