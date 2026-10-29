import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../../java-analyzer.mjs';
import { ALLOWED_FORM_FIRST } from '../test-support/allowed-form.mjs';
import { withRuleMessage } from '../../../messages/rule-messages.mjs';

const root = path.resolve(import.meta.dirname, '../../../../..');
const ruleset = readFileSync(path.join(root, 'languages/java/gradle/spring-ruleset.xml'), 'utf8');
const docs = readFileSync(path.join(root, 'docs/java-preset.md'), 'utf8');
const testRuleset = readFileSync(
  path.join(root, 'languages/java/gradle/spring-test-ruleset.xml'),
  'utf8',
);
const RULE = /<rule name="(?<name>[A-Za-z]+)"[^>]*?\smessage="(?<message>[^"]*)"/g;
const rules = [...ruleset.matchAll(RULE)].map(({ groups }) => groups);
const testRules = [...testRuleset.matchAll(RULE)].map(({ groups }) => groups);
const PMD_RULESETS = [
  'pmd-ruleset.xml',
  'pmd-main-ruleset.xml',
  'pmd-test-ruleset.xml',
  'spring-ruleset.xml',
  'spring-test-ruleset.xml',
];
const JAKARTA_TYPE = /'jakarta\.(?<type>[\w.]+)'/g;

describe('spring-ruleset.xml', () => {
  it('is part of the Java analyzer cache key', () => {
    expect(configurationFiles().filter((file) => file.endsWith('spring-ruleset.xml'))).toEqual([
      'languages/java/gradle/spring-ruleset.xml',
    ]);
  });

  it('declares every rule with a unique name and a message', () => {
    const names = rules.map(({ name }) => name);

    expect(names.length).toBeGreaterThan(40);
    expect(new Set(names).size).toBe(names.length);
    expect(ruleset.match(/<rule name=/g)).toHaveLength(names.length);
  });

  it('leaves the exception route to the gate, which adds the shared sentence', () => {
    const handWritten = rules
      .filter(({ message }) => /nitpicker\.config|add an exception|"exceptions"/u.test(message))
      .map(({ name }) => name);

    expect(handWritten).toEqual([]);
  });

  it('leads every message with the allowed form, never with a prohibition or the problem', () => {
    expect(
      [...rules, ...testRules]
        .filter(({ message }) => !ALLOWED_FORM_FIRST.test(message))
        .map(({ name }) => name),
    ).toEqual([]);
  });

  it('gives each test-source rule the first sentence of its message as the allowed form', () => {
    const forms = testRules.map(({ name, message }) => {
      const finding = withRuleMessage({
        tool: 'pmd',
        rule: name,
        path: 'src/test/java/demo/SampleTest.java',
        message,
        classification: 'enforceable',
      });
      return [name, finding.allowedForm, finding.message.startsWith(finding.allowedForm)];
    });

    expect(forms).toEqual(
      testRules.map(({ name, message }) => [name, `${message.split('. ')[0]}.`, true]),
    );
  });

  it('keeps braces out of messages, which PMD formats as patterns', () => {
    expect(rules.filter(({ message }) => /[{}]/.test(message)).map(({ name }) => name)).toEqual([]);
  });

  it.each(PMD_RULESETS)('matches each jakarta type with its javax twin in %s', (name) => {
    const text = readFileSync(path.join(root, 'languages/java/gradle', name), 'utf8');
    const unpaired = [...text.matchAll(JAKARTA_TYPE)]
      .map(({ groups }) => groups.type)
      .filter((type) => !text.includes(`'javax.${type}'`));

    expect(unpaired).toEqual([]);
  });

  it('lists every rule in the Java preset docs', () => {
    const undocumented = rules
      .map(({ name }) => name)
      .filter((name) => !docs.includes(`\`${name}\``));

    expect(undocumented).toEqual([]);
  });
});
