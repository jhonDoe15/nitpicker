import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectedSources } from './source-patterns.mts';

const ROOT = path.join(path.sep, 'work', 'app', 'src', 'main', 'java');
const files = [
  'org/example/A.java',
  'org/example/jwk/EdEcKeys.java',
  'org/example/jwk/Keys.java',
].map((file) => path.join(ROOT, file));

function selected(includes: string[], excludes: string[]): string[] {
  return selectedSources([ROOT], files, { includes, excludes }).map((file) =>
    path.relative(ROOT, file).replaceAll(path.sep, '/'),
  );
}

describe('selectedSources', () => {
  it('keeps every file without includes or excludes, as the compiler plugin does', () => {
    expect(selected([], [])).toEqual([
      'org/example/A.java',
      'org/example/jwk/EdEcKeys.java',
      'org/example/jwk/Keys.java',
    ]);
    expect(selectedSources([ROOT], files, undefined)).toEqual(files);
  });

  it('applies Ant patterns relative to the source root', () => {
    expect(selected([], ['org/example/jwk/EdEcKeys.java'])).toEqual([
      'org/example/A.java',
      'org/example/jwk/Keys.java',
    ]);
    expect(selected(['org/example/jwk/EdEcKeys.java'], [])).toEqual([
      'org/example/jwk/EdEcKeys.java',
    ]);
    expect(selected(['**/jwk/*.java'], ['**/Ed*.java'])).toEqual(['org/example/jwk/Keys.java']);
    expect(selected(['org/example/jwk/'], [])).toEqual([
      'org/example/jwk/EdEcKeys.java',
      'org/example/jwk/Keys.java',
    ]);
  });
});
