import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');
const RULESETS = readdirSync(path.join(packageRoot, 'languages/java/gradle'))
  .filter((file) => file.endsWith('-ruleset.xml'))
  .map((file) => `languages/java/gradle/${file}`);

function attribute(attributes, name) {
  return new RegExp(String.raw`\b${name}="([^"]*)"`, 'u').exec(attributes)?.[1];
}

function messages(file) {
  const text = readFileSync(path.join(packageRoot, file), 'utf8');
  return [...text.matchAll(/<rule\b([^>]*)>/gu)]
    .map(([, attributes]) => ({
      name: attribute(attributes, 'name') ?? attribute(attributes, 'ref')?.split('/').at(-1),
      message: attribute(attributes, 'message')?.replaceAll('&quot;', '"'),
    }))
    .filter(({ message }) => message !== undefined);
}

function withoutQuotes(message) {
  return message.replaceAll("''", '').replaceAll("'{'", '');
}

describe.each(RULESETS)('%s messages go through MessageFormat', (file) => {
  const rules = messages(file);

  it('has messages to check, including the ones that override a PMD rule', () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  it('never leaves a single apostrophe, which MessageFormat would swallow', () => {
    const swallowed = rules.filter(({ message }) => withoutQuotes(message).includes("'"));
    expect(swallowed.map(({ name }) => name)).toEqual([]);
  });

  it('quotes every brace except the {0} argument', () => {
    const unquoted = rules.filter(({ message }) => /\{(?!0\})/.test(withoutQuotes(message)));
    expect(unquoted.map(({ name }) => name)).toEqual([]);
  });
});

describe('nitpicker messages on PMD rules it references', () => {
  it('are checked like the messages of its own rules', () => {
    const overridden = [
      'AvoidFieldNameMatchingMethodName',
      'AvoidLiteralsInIfCondition',
      'AssignmentInOperand',
      'GuardLogStatement',
    ];
    const names = RULESETS.flatMap((file) => messages(file).map(({ name }) => name));

    expect(names.filter((name) => overridden.includes(name))).toEqual(overridden);
  });
});
