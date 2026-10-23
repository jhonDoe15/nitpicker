import { describe, expect, it } from 'vitest';
import { docsUrl } from '../messages/docs-url.mjs';
import { ruleEntry } from './entry.mjs';
import {
  analyzersText,
  entryFacts,
  entryLinks,
  linkUrl,
  presetsOf,
  printedTools,
} from './facts.mjs';

const BASE = {
  tool: 'structure',
  rule: 'function-lines-limit',
  page: 'checks',
  summary: 'A function is too long.',
  why: 'Long functions hide bugs.',
  allowed: 'Split it.',
  limit: 'more than 50 lines',
  analyzers: { typescript: ['structure'], javascript: ['structure'], java: ['java'] },
  exception: { key: 'exceptions', rule: 'structure/function-lines-limit', function: true },
};
const entry = (fields = {}) => ruleEntry({ ...BASE, ...fields });
const labels = (facts) => facts.map(({ label }) => label);

describe('printedTools', () => {
  it('lists the entry tool and the tools its findings print, without the family tool eslint', () => {
    expect(printedTools(entry({ findingTools: ['crap'] }))).toEqual(['structure', 'crap']);
    expect(printedTools(entry({ tool: 'eslint', findingTools: ['eslint-lint'] }))).toEqual([
      'eslint-lint',
    ]);
  });
});

describe('presetsOf and analyzersText', () => {
  it('lists presets in preset order', () => {
    expect(presetsOf(entry())).toEqual(['typescript', 'javascript', 'java']);
  });

  it('names the analyzers once when every preset shares them, and by preset otherwise', () => {
    expect(
      analyzersText(entry({ analyzers: { typescript: ['structure'], java: ['structure'] } })),
    ).toBe('`structure`');
    expect(analyzersText(entry())).toBe('`structure` (TypeScript and JavaScript); `java` (Java)');
  });

  it('names nothing for a finding no analyzer runs', () => {
    expect(analyzersText(entry({ analyzers: { typescript: [], java: [] } }))).toBeUndefined();
  });
});

describe('entryFacts', () => {
  it('lists the facts in reading order, skipping those the entry lacks', () => {
    const facts = entryFacts(entry());

    expect(labels(facts)).toEqual([
      'Presets',
      'Analyzers',
      'Why it is on',
      'Allowed form',
      'Threshold',
      'Exception',
    ]);
    expect(facts.find(({ label }) => label === 'Presets').text).toBe(
      'TypeScript, JavaScript and Java',
    );
    expect(facts.find(({ label }) => label === 'Exception').text).toBe(
      'If this is intended, add `{"rule":"structure/function-lines-limit","paths":["<path>"],"function":"<function>","reason":"..."}` to "exceptions" in nitpicker.config.json.',
    );
  });

  it('adds what the entry names beyond the common facts', () => {
    const facts = entryFacts(
      entry({
        findingTools: ['crap'],
        builds: ['gradle', 'maven'],
        scope: 'Main sources.',
        forms: [
          { label: 'a', message: 'Use one.' },
          { label: 'b', message: 'Use one.' },
          { message: 'Use two.' },
        ],
      }),
    );

    expect(labels(facts)).toEqual([
      'Printed as',
      'Presets',
      'Analyzers',
      'Builds',
      'Scope',
      'Why it is on',
      'Allowed form',
      'Threshold',
      'Exception',
      'Allowed forms by message',
    ]);
    expect(facts.find(({ label }) => label === 'Printed as').text).toBe(
      '`structure/function-lines-limit` and `crap/function-lines-limit`',
    );
    expect(facts.find(({ label }) => label === 'Builds').text).toBe('Gradle and Maven');
    expect(facts.at(-1)).toEqual({
      label: 'Allowed forms by message',
      items: ['`a`, `b`: Use one.', 'Use two.'],
    });
  });
});

describe('entryLinks and linkUrl', () => {
  it('lists the guides of the repository first, then outside documentation', () => {
    const links = entryLinks(
      entry({
        docs: [{ label: 'Checks catalog', path: 'spec/checks.md', anchor: 'structure' }],
        links: [{ label: 'Rule documentation', url: 'https://example.com/rule', extra: 1 }],
      }),
    );

    expect(links.map(({ label }) => label)).toEqual(['Checks catalog', 'Rule documentation']);
    expect(linkUrl(links[0])).toBe(docsUrl('spec/checks.md', 'structure'));
    expect(linkUrl(links[1])).toBe('https://example.com/rule');
  });
});
