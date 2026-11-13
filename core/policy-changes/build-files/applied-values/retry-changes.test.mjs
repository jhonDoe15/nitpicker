import { describe, expect, it } from 'vitest';
import { testsConfigChanges } from './retry-changes.mjs';

const FILES = ['pytest.ini'];

function changes(base, head) {
  return testsConfigChanges({ base, head, file: 'pytest.ini', files: FILES });
}

describe('the retry changes of a project config', () => {
  it('lists each key that moved, and loosens for more retries', () => {
    expect(changes({}, { reruns: 3, reruns_delay: 1 })).toEqual([
      { loosened: { text: 'tests pytest.ini reruns: 0 -> 3', kind: 'tool-config', files: FILES } },
      {
        loosened: {
          text: 'tests pytest.ini reruns_delay: 0 -> 1',
          kind: 'tool-config',
          files: FILES,
        },
      },
    ]);
  });

  it('only changes for fewer retries or a delay that nothing retries', () => {
    expect(changes({ retries: 3 }, { retries: 1 })).toEqual([
      { changed: 'tests pytest.ini retries: 3 -> 1' },
    ]);
    expect(changes({ retry_delay: 0 }, { retry_delay: 5 })).toEqual([
      { changed: 'tests pytest.ini retry_delay: 0 -> 5' },
    ]);
    expect(changes({ reruns: 2 }, { reruns: 2 })).toEqual([]);
  });

  it('keeps the runner config keys of the TypeScript and JavaScript presets', () => {
    expect(changes({ retry: 0, 'retry.delay': 0 }, { retry: 5, 'retry.delay': 0 })).toEqual([
      { loosened: { text: 'tests pytest.ini retry: 0 -> 5', kind: 'tool-config', files: FILES } },
    ]);
  });

  it('names the file the value changed in, not the first one that declares retries', () => {
    const found = testsConfigChanges({
      base: { 'surefire.rerunFailingTestsCount': 0, 'failsafe.rerunFailingTestsCount': 1 },
      head: { 'surefire.rerunFailingTestsCount': 0, 'failsafe.rerunFailingTestsCount': 3 },
      file: 'pom.xml',
      files: ['pom.xml', 'app/pom.xml'],
      fileByKey: { 'failsafe.rerunFailingTestsCount': 'app/pom.xml' },
    });

    expect(found).toEqual([
      {
        loosened: {
          text: 'tests app/pom.xml failsafe.rerunFailingTestsCount: 1 -> 3',
          kind: 'tool-config',
          files: ['pom.xml', 'app/pom.xml'],
        },
      },
    ]);
  });
});
