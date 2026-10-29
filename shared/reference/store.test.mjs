import { describe, expect, it } from 'vitest';
import { docsUrl } from '../messages/docs-url.mjs';
import { ruleEntry } from './entry.mjs';
import {
  closestIds,
  entryForFinding,
  helpUriFor,
  indexEntries,
  lookupEntries,
  decodePage,
  encodePage,
  readReferenceEntries,
  referenceLinks,
  referenceUrl,
  withHelpUris,
} from './store.mjs';

const entries = [
  ruleEntry({ tool: 'pmd', rule: 'UnusedLocalVariable', page: 'java-pmd' }),
  ruleEntry({
    tool: 'eslint',
    rule: '@typescript-eslint/no-explicit-any',
    page: 'typescript-eslint',
    findingTools: ['eslint-lint'],
  }),
  ruleEntry({
    tool: 'mypy',
    rule: '<error code>',
    page: 'python-types',
    pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
    barePattern: false,
  }),
  ruleEntry({
    tool: 'ruff',
    rule: 'F401',
    page: 'python-ruff',
  }),
];
const index = indexEntries(entries);

describe('entryForFinding', () => {
  it('finds the entry of the tool and rule a finding prints', () => {
    expect(entryForFinding(index, { tool: 'pmd', rule: 'UnusedLocalVariable' }).id).toBe(
      'pmd/UnusedLocalVariable',
    );
    expect(
      entryForFinding(index, { tool: 'eslint-lint', rule: '@typescript-eslint/no-explicit-any' })
        .id,
    ).toBe('eslint/@typescript-eslint/no-explicit-any');
  });

  it('finds the entry that stands for every rule matching its pattern', () => {
    expect(entryForFinding(index, { tool: 'mypy', rule: 'attr-defined' }).id).toBe(
      'mypy/<error code>',
    );
    expect(entryForFinding(index, { tool: 'pmd', rule: 'attr-defined' })).toBeUndefined();
  });

  it('finds nothing for a rule the reference does not know', () => {
    expect(entryForFinding(index, { tool: 'pmd', rule: 'Nope' })).toBeUndefined();
  });
});

describe('lookupEntries', () => {
  it('finds a rule by its id, in any case, and by the tool name a finding prints', () => {
    expect(lookupEntries(index, 'pmd/UnusedLocalVariable').map(({ id }) => id)).toEqual([
      'pmd/UnusedLocalVariable',
    ]);
    expect(lookupEntries(index, ' PMD/unusedlocalvariable ').map(({ id }) => id)).toEqual([
      'pmd/UnusedLocalVariable',
    ]);
    expect(lookupEntries(index, 'eslint-lint/@typescript-eslint/no-explicit-any')).toHaveLength(1);
  });

  it('finds a bare rule name', () => {
    expect(lookupEntries(index, 'F401').map(({ id }) => id)).toEqual(['ruff/F401']);
  });

  it('finds the family a tool/rule name matches and nothing for an unknown name', () => {
    expect(lookupEntries(index, 'mypy/attr-defined').map(({ id }) => id)).toEqual([
      'mypy/<error code>',
    ]);
    expect(lookupEntries(index, 'mypy/Attr_Defined')).toEqual([]);
    expect(lookupEntries(index, 'nothing/here')).toEqual([]);
  });
});

describe('closestIds', () => {
  it('names the entries nearest to a misspelled rule, nearest first', () => {
    expect(closestIds(index, 'pmd/UnusedLocalVarable')[0]).toBe('pmd/UnusedLocalVariable');
    expect(closestIds(index, 'unusedlocal')).toEqual(['pmd/UnusedLocalVariable']);
  });

  it('names nothing when nothing is near and limits the list', () => {
    expect(closestIds(index, 'zzzzzzzzzzzzzzzzzzzzzzzz/qqqqqqqqqqqqqqqqqq')).toEqual([]);
    expect(closestIds(index, 'f', 1)).toHaveLength(1);
  });
});

describe('referenceUrl', () => {
  it('links the page of the entry at its anchor', () => {
    expect(referenceUrl(entries[0])).toBe(
      docsUrl('docs/rules/java-pmd.md', 'pmd-unusedlocalvariable'),
    );
  });
});

describe('the committed reference', () => {
  it('reads every entry and indexes them', () => {
    const committed = readReferenceEntries();

    expect(committed.length).toBeGreaterThan(2000);
    expect(referenceLinks().index().entries).toHaveLength(committed.length);
  });

  it('gives a helpUri for a rule it knows and none for one it does not', () => {
    const links = referenceLinks();

    expect(helpUriFor(links, { tool: 'structure', rule: 'function-lines-limit' })).toBe(
      docsUrl('docs/rules/checks.md', 'structure-function-lines-limit'),
    );
    expect(helpUriFor(links, { tool: 'nothing', rule: 'here' })).toBeUndefined();
  });

  it('reads the data and the link root once per referenceLinks object', () => {
    const links = referenceLinks();

    expect(links.index()).toBe(links.index());
    expect(links.root()).toBe(links.root());
    expect(links.index()).not.toBe(referenceLinks().index());
  });

  it('finds a dotted detekt rule by its last part', () => {
    expect(
      lookupEntries(referenceLinks().index(), 'MagicNumber')
        .map(({ id }) => id)
        .filter((id) => id.startsWith('detekt/')),
    ).toEqual(['detekt/detekt.style.MagicNumber']);
  });
});

describe('encodePage and decodePage', () => {
  it('keeps each value once and restores the entries with their derived fields', () => {
    const page = [
      ruleEntry({ tool: 'demo', rule: 'one', page: 'checks', why: 'Shared.', limit: '5' }),
      ruleEntry({ tool: 'demo', rule: 'two', page: 'checks', why: 'Shared.' }),
    ];
    const encoded = encodePage(page);

    expect(encoded.values.filter((value) => value === 'Shared.')).toHaveLength(1);
    expect(encoded.fields).toEqual(['tool', 'rule', 'why', 'limit']);
    expect(decodePage('checks', JSON.parse(JSON.stringify(encoded)))).toEqual(page);
  });
});

describe('withHelpUris', () => {
  it('adds a helpUri to the findings whose rule is known and keeps one already given', () => {
    const known = { tool: 'structure', rule: 'function-lines-limit' };
    const given = { ...known, helpUri: 'https://example.com/rule' };
    const unknown = { tool: 'nothing', rule: 'here' };

    const [withKnown, withGiven, withUnknown] = withHelpUris([known, given, unknown]);

    expect(withKnown).toEqual({
      ...known,
      helpUri: docsUrl('docs/rules/checks.md', 'structure-function-lines-limit'),
    });
    expect(withGiven.helpUri).toBe('https://example.com/rule');
    expect(withUnknown).toBe(unknown);
  });

  it('returns an empty list untouched', () => {
    const none = [];

    expect(withHelpUris(none)).toBe(none);
  });
});
