import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const RULESETS = ['pmd-ruleset.xml', 'spring-ruleset.xml'];

function messages(file) {
  const text = readFileSync(new URL(`../../gradle/${file}`, import.meta.url), 'utf8');
  return [...text.matchAll(/<rule\b[^>]*?\bname="([^"]+)"[^>]*?\bmessage="([^"]*)"/g)].map(
    ([, name, message]) => ({ name, message: message.replaceAll('&quot;', '"') }),
  );
}

function withoutQuotes(message) {
  return message.replaceAll("''", '').replaceAll("'{'", '');
}

describe.each(RULESETS)('%s messages go through MessageFormat', (file) => {
  const rules = messages(file);

  it('has messages to check', () => {
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
