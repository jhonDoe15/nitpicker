import { describe, expect, it } from 'vitest';
import { gradleStatements } from './gradle-script.mjs';

describe('gradleStatements', () => {
  it('pairs each statement with the headers of the blocks around it', () => {
    const script =
      "sourceSets {\n  main {\n    java { srcDirs = ['a'] }\n  }\n}\ntest { exclude '**/Slow*' }\n";

    expect(gradleStatements(script)).toEqual([
      { path: ['sourceSets', 'main', 'java'], text: "srcDirs = ['a']" },
      { path: ['test'], text: "exclude '**/Slow*'" },
    ]);
  });

  it('keeps a list or a trailing-comma argument list on several lines as one statement', () => {
    const script =
      "test {\n  exclude '**/A*',\n          '**/B*'\n  srcDirs = [\n    'x',\n    'y'\n  ]\n}\n";

    expect(gradleStatements(script).map(({ text }) => text)).toEqual([
      "exclude '**/A*', '**/B*'",
      "srcDirs = [ 'x', 'y' ]",
    ]);
  });

  it('drops comments and leaves braces and comment markers inside strings alone', () => {
    const script =
      "// test { exclude 'gone' }\n/* sourceSets { } */\ntest {\n  systemProperty 'url', 'http://x/{y}' // note\n  exclude \"${'$'}{a}/**\"\n}\n";

    expect(gradleStatements(script)).toEqual([
      { path: ['test'], text: "systemProperty 'url', 'http://x/{y}'" },
      { path: ['test'], text: 'exclude "${\'$\'}{a}/**"' },
    ]);
  });
});
