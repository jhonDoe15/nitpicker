import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../java-analyzer.mjs';
import { ALLOWED_FORM_FIRST } from '../spring/test-support/allowed-form.mjs';

const root = path.resolve(import.meta.dirname, '../../../..');
const ruleset = readFileSync(path.join(root, 'languages/java/gradle/reactor-ruleset.xml'), 'utf8');
const docs = readFileSync(path.join(root, 'docs/java-preset.md'), 'utf8');
const RULE = /<rule name="(?<name>[A-Za-z]+)"[^>]*?\smessage="(?<message>[^"]*)"/g;
const rules = [...ruleset.matchAll(RULE)].map(({ groups }) => groups);

describe('reactor-ruleset.xml', () => {
  it('is part of the Java analyzer cache key', () => {
    expect(configurationFiles()).toContain('languages/java/gradle/reactor-ruleset.xml');
  });

  it('declares the two Reactor rules, each with a unique name', () => {
    expect(rules.map(({ name }) => name)).toEqual([
      'ReactorBlockingInOperator',
      'ReactorBlockInReactiveMethod',
    ]);
    expect(ruleset.match(/<rule name=/g)).toHaveLength(rules.length);
  });

  it('leads every message with the allowed form and leaves the exception route to the gate', () => {
    expect(rules.filter(({ message }) => !ALLOWED_FORM_FIRST.test(message))).toEqual([]);
    expect(rules.filter(({ message }) => /nitpicker\.config|"exceptions"/u.test(message))).toEqual(
      [],
    );
    expect(rules.filter(({ message }) => /[{}]/u.test(message))).toEqual([]);
  });

  it('names the offloading scheduler in the operator rule', () => {
    expect(rules[0].message).toContain('Schedulers.boundedElastic()');
  });

  it('lists every rule in the Java preset docs', () => {
    expect(rules.filter(({ name }) => !docs.includes(`\`${name}\``))).toEqual([]);
  });
});
