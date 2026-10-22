import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../../java-analyzer.mjs';

const root = path.resolve(import.meta.dirname, '../../../../..');
const ruleset = readFileSync(path.join(root, 'languages/java/gradle/spring-ruleset.xml'), 'utf8');
const docs = readFileSync(path.join(root, 'docs/java-preset.md'), 'utf8');
const RULE = /<rule name="(?<name>[A-Za-z]+)"[^>]*?\smessage="(?<message>[^"]*)"/g;
const rules = [...ruleset.matchAll(RULE)].map(({ groups }) => groups);
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

  it('leaves the exception line to the shared rule messages', () => {
    const routed = rules
      .filter(({ message }) => message.includes('nitpicker.config.json'))
      .map(({ name }) => name);

    expect(routed).toEqual([]);
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
