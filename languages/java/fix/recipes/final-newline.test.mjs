import { describe, expect, it } from 'vitest';
import { kotlinFinalNewlineRecipe } from './final-newline.mjs';

function plan(files) {
  return kotlinFinalNewlineRecipe.plan({ files }).fixes;
}

describe('kotlinFinalNewlineRecipe', () => {
  it('appends the line ending of the file to a Kotlin file without a final one', () => {
    expect(
      plan([
        { path: 'src/A.kt', text: 'class A' },
        { path: 'src/B.kt', text: 'class B\r\n{\r\n}' },
      ]),
    ).toEqual([
      {
        finding: {
          tool: 'detekt',
          rule: 'detekt.style.NewLineAtEndOfFile',
          path: 'src/A.kt',
          line: 1,
        },
        edits: [{ type: 'replace', path: 'src/A.kt', start: 7, end: 7, text: '\n' }],
      },
      {
        finding: {
          tool: 'detekt',
          rule: 'detekt.style.NewLineAtEndOfFile',
          path: 'src/B.kt',
          line: 3,
        },
        edits: [{ type: 'replace', path: 'src/B.kt', start: 13, end: 13, text: '\r\n' }],
      },
    ]);
  });
  it('leaves empty files, files that end a line, and other files alone', () => {
    expect(
      plan([
        { path: 'src/A.kt', text: '' },
        { path: 'src/B.kt', text: 'class B\n' },
        { path: 'src/C.java', text: 'class C {}' },
        { path: 'build.gradle.kts', text: 'plugins {}' },
      ]),
    ).toEqual([]);
  });
});
