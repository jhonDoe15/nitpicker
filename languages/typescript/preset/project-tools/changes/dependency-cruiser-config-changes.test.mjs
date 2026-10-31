import { describe, expect, it } from 'vitest';
import { dependencyCruiserConfigChanges } from './dependency-cruiser-config-changes.mjs';

const FILES = ['.dependency-cruiser.json'];
const LABEL = 'dependency-cruiser .dependency-cruiser.json';
const RULE = { name: 'no-lib', severity: 'error', from: { path: '^src' }, to: { path: '^lib' } };
const UNNAMED = { severity: 'error', from: { path: '^src' }, to: { path: '^vendor' } };

function changes(base, head) {
  return dependencyCruiserConfigChanges({
    base,
    head,
    precedence: ['project', 'nitpicker'],
    label: LABEL,
    files: FILES,
  });
}

function loosened(text) {
  return { loosened: { text: `${LABEL} ${text}`, kind: 'tool-config', files: FILES } };
}

function changed(text) {
  return { changed: `${LABEL} ${text}` };
}

const shown = (rules) => JSON.stringify(rules);

describe('what an edit of the dependency-cruiser config changes', () => {
  it.each([
    [{ forbidden: [RULE] }, {}, loosened(`forbidden: ${shown([RULE])} -> not set`)],
    [
      { forbidden: [RULE] },
      { forbidden: [{ ...RULE, severity: 'warn' }] },
      loosened(`forbidden: ${shown([RULE])} -> ${shown([{ ...RULE, severity: 'warn' }])}`),
    ],
    [
      { forbidden: [RULE] },
      { forbidden: [RULE, { ...RULE, name: 'no-cycles' }] },
      loosened(`forbidden: ${shown([RULE])} -> ${shown([{ ...RULE, name: 'no-cycles' }, RULE])}`),
    ],
    [
      { forbidden: [RULE] },
      { forbidden: [RULE, UNNAMED] },
      changed(`forbidden: ${shown([RULE])} -> ${shown([RULE, UNNAMED])}`),
    ],
    [{}, { required: [UNNAMED] }, changed(`required: not set -> ${shown([UNNAMED])}`)],
    [{}, { required: [RULE] }, loosened(`required: not set -> ${shown([RULE])}`)],
    [{}, { allowed: [UNNAMED] }, loosened(`allowed: not set -> ${shown([UNNAMED])}`)],
    [
      { allowed: [UNNAMED, RULE] },
      { allowed: [RULE] },
      changed(`allowed: ${shown([RULE, UNNAMED])} -> ${shown([RULE])}`),
    ],
    [
      {},
      { options: { exclude: { path: [{ $nitpickerRegExp: ['^gen', 'u'] }] } } },
      loosened('options.exclude: not set -> ["path ^gen"]'),
    ],
    [
      { options: { doNotFollow: { path: '^a', dependencyTypes: ['npm'] } } },
      { options: { doNotFollow: '^a' } },
      changed('options.doNotFollow: ["dependency type npm","path ^a"] -> ["path ^a"]'),
    ],
    [{}, { allowedSeverity: 'info' }, loosened('allowedSeverity: not set -> "info"')],
    [
      {},
      { options: { combinedDependencies: true } },
      loosened('options.combinedDependencies: not set -> true'),
    ],
  ])('reads %j -> %j', (base, head, expected) => {
    expect(changes(base, head)).toEqual([expected]);
  });

  it('ignores what nitpicker owns and how the rules are ordered', () => {
    const owned = { tsPreCompilationDeps: false, outputType: 'dot', includeOnly: '^src' };
    expect(changes({}, { options: owned })).toEqual([]);
    expect(changes({ forbidden: [RULE, UNNAMED] }, { forbidden: [UNNAMED, RULE] })).toEqual([]);
  });
});
