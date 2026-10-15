import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../../java-analyzer.mjs';

const root = path.resolve(import.meta.dirname, '../../../../..');
const ruleset = readFileSync(path.join(root, 'languages/java/gradle/spring-ruleset.xml'), 'utf8');
const docs = readFileSync(path.join(root, 'docs/java-preset.md'), 'utf8');
const RULE = /<rule name="(?<name>[A-Za-z]+)"[^>]*?\smessage="(?<message>[^"]*)"/g;
const rules = [...ruleset.matchAll(RULE)].map(({ groups }) => groups);
const NAMES_MARKER_INSTEAD = new Set(['SpringDataNativeQuery']);

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

  it('ends each message with the exception line for its own rule', () => {
    const wrong = rules
      .filter(({ name }) => !NAMES_MARKER_INSTEAD.has(name))
      .filter(
        ({ name, message }) =>
          !message.endsWith(`add an exception for pmd/${name} in nitpicker.config.json.`),
      )
      .map(({ name }) => name);

    expect(wrong).toEqual([]);
  });

  it('keeps braces out of messages, which PMD formats as patterns', () => {
    expect(rules.filter(({ message }) => /[{}]/.test(message)).map(({ name }) => name)).toEqual([]);
  });

  it('lists every rule in the Java preset docs', () => {
    const undocumented = rules
      .map(({ name }) => name)
      .filter((name) => !docs.includes(`\`${name}\``));

    expect(undocumented).toEqual([]);
  });
});
