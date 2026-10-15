import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../java-analyzer.mjs';
import { expectedViolations } from '../test-support/violation-markers.mjs';
import { codeSmellRules } from '../test-support/code-smell-rules.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const fixture = path.join(import.meta.dirname, '..', 'fixtures', 'code-smells-project', 'src');
const rules = codeSmellRules();

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

  it.each(rules)('$name names its exception route', ({ name, message }) => {
    expect(message.endsWith(`add an exception for pmd/${name} in nitpicker.config.json.`)).toBe(
      true,
    );
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

  it('ships both rulesets and the init script that scopes them', () => {
    const script = readFileSync(
      path.join(packageRoot, 'languages/java/gradle/nitpicker.init.gradle'),
      'utf8',
    );
    const shipped = ['code-smells-ruleset.xml', 'code-smells-test-ruleset.xml'];
    expect({
      inScript: shipped.filter((file) => script.includes(`'${file}'`)),
      shipped: shipped.filter((file) =>
        configurationFiles().includes(`languages/java/gradle/${file}`),
      ),
    }).toEqual({ inScript: shipped, shipped });
  });
});
