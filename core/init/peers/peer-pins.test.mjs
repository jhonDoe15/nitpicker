import { describe, expect, it } from 'vitest';
import { chooseVitest, minimumOf, typescriptRequirement } from './peer-pins.mts';

const PEERS = {
  4: { vite: '^6.0.0 || ^7.0.0 || ^8.0.0' },
  5: { vite: '^6.4.0 || ^7.0.0 || ^8.0.0' },
};

const asExact = (version) => (version === undefined ? undefined : { exact: version });

function choose(versions, declared = {}) {
  return chooseVitest({
    supported: '^4.1.11 || ^5.0.0',
    peers: PEERS,
    versionOf: (name) =>
      declared[name] === undefined ? asExact(versions[name]) : { declared: declared[name] },
    addCommand: 'yarn add --dev',
  });
}

function blockedAdvice(found) {
  return [
    'No Vitest that nitpicker supports (^4.1.11 || ^5.0.0) runs with the installed packages: ',
    `Vitest 5 needs vite ^6.4.0 || ^7.0.0 || ^8.0.0 but the project has ${found}; `,
    `Vitest 4 needs vite ^6.0.0 || ^7.0.0 || ^8.0.0 but the project has ${found}. `,
    'Upgrade vite first (for example yarn add --dev vite@latest), then run nitpicker init again.',
  ].join('');
}

describe('typescriptRequirement', () => {
  it('keeps the lower bound nitpicker needs and the upper bound its tools accept', () => {
    expect(typescriptRequirement('>=5.7', '>=4.8.4 <6.1.0')).toBe('typescript@>=5.7 <6.1.0');
  });

  it('falls back to the bare name when the tools state no upper bound', () => {
    expect(typescriptRequirement('>=5.7', '>=4.8.4')).toBe('typescript');
    expect(typescriptRequirement('>=5.7', undefined)).toBe('typescript');
  });
});

describe('chooseVitest', () => {
  it('leaves the names bare when the newest supported Vitest fits', () => {
    expect(choose({})).toEqual({
      kind: 'fits',
      vitest: 'vitest',
      coverage: '@vitest/coverage-v8',
    });
  });

  it('takes Vitest 4 when Vite is 6.0 to 6.3, which Vitest 5 does not accept', () => {
    expect(choose({ vite: '6.1.0' })).toEqual({
      kind: 'fits',
      vitest: 'vitest@^4.1.11',
      coverage: '@vitest/coverage-v8@^4.1.11',
    });
  });

  it('leaves the names bare for a Vite that Vitest 5 accepts', () => {
    expect(choose({ vite: '7.0.0' })).toEqual({
      kind: 'fits',
      vitest: 'vitest',
      coverage: '@vitest/coverage-v8',
    });
  });

  it('does not let an unrelated package such as @types/node block Vitest', () => {
    expect(choose({ vite: '7.0.0', '@types/node': '23.1.0' })).toEqual({
      kind: 'fits',
      vitest: 'vitest',
      coverage: '@vitest/coverage-v8',
    });
  });

  it('uses the highest major a declared Vite range allows when nothing is installed', () => {
    expect(choose({}, { vite: '>=5' })).toEqual({
      kind: 'fits',
      vitest: 'vitest',
      coverage: '@vitest/coverage-v8',
    });
    expect(choose({}, { vite: '^5.4.0' })).toEqual({
      kind: 'blocked',
      advice: blockedAdvice('^5.4.0'),
    });
    expect(choose({}, { vite: '~6.1.0' })).toEqual({
      kind: 'fits',
      vitest: 'vitest@^4.1.11',
      coverage: '@vitest/coverage-v8@^4.1.11',
    });
  });

  it('cannot tell from a tag, so it blocks nothing', () => {
    expect(choose({}, {})).toEqual({
      kind: 'fits',
      vitest: 'vitest',
      coverage: '@vitest/coverage-v8',
    });
  });

  it('treats a prerelease Vite as older than its release', () => {
    expect(choose({ vite: '6.0.0-beta.1' })).toEqual({
      kind: 'blocked',
      advice: blockedAdvice('6.0.0-beta.1'),
    });
  });

  it('says to upgrade Vite first when no supported Vitest fits it', () => {
    expect(choose({ vite: '5.4.11' })).toEqual({
      kind: 'blocked',
      advice: blockedAdvice('5.4.11'),
    });
  });
});

describe('minimumOf', () => {
  it('names the lowest version a peer range asks for', () => {
    expect(minimumOf('>=5.7')).toBe('5.7');
    expect(minimumOf('^4.1.11 || ^5.0.0')).toBe('4.1.11');
    expect(minimumOf(undefined)).toBeUndefined();
  });
});
