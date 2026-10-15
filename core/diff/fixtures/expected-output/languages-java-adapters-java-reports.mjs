import { expect } from 'vitest';
export function expectedOutput132_34({ bad, CS_INDENT, CS_LENGTH }) {
  return [
    ['pmd', 'EmptyCatchBlock', bad, 'fp:nitpicker/subject=Avoid empty catch blocks'],
    ['pmd', 'EmptyCatchBlock', bad, 'fp:nitpicker/subject=Avoid empty catch blocks#2'],
    ['spotbugs', 'DM_DEFAULT_ENCODING', bad, 'fp:nitpicker/subject=demo.Bad.decode'],
    ['google-java-format', 'format', bad, 'format'],
    ['checkstyle', CS_INDENT, bad, expect.stringMatching(/^[0-9a-f]+/)],
    ['checkstyle', CS_INDENT, bad, expect.stringMatching(/^[0-9a-f]+.*#2$/)],
    ['checkstyle', CS_LENGTH, bad, expect.stringMatching(/^[0-9a-f]+/)],
    [
      'duplicates',
      'duplicate-clone',
      'src/main/java/demo/Bad.java',
      expect.stringMatching(
        /^pair:src\/main\/java\/demo\/Bad\.java\|src\/main\/java\/demo\/Copy\.java:fragment:[0-9a-f]+:occurrence:1$/,
      ),
    ],
    [
      'duplicates',
      'duplicate-clone-size',
      bad,
      'pair:src/main/java/demo/Bad.java|src/main/java/demo/Copy.java:occurrence:1:lines',
    ],
    [
      'duplicates',
      'duplicate-clone-size',
      bad,
      'pair:src/main/java/demo/Bad.java|src/main/java/demo/Copy.java:occurrence:1:tokens',
    ],
    ['jacoco', 'line-coverage', bad, 'line-coverage'],
    ['jacoco', 'uncovered-method', bad, expect.stringMatching(/^cov:/)],
    [
      'crap',
      'crap-score-limit',
      bad,
      expect.stringMatching(/^function:Bad::decode\( byte\[\] bytes\):source:[0-9a-f]{24}$/),
    ],
    ['jacoco', 'changed-branch-coverage', bad, expect.stringMatching(/^branch-source:/)],
  ];
}
