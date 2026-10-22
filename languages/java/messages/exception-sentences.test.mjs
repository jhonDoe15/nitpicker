import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../adapters/java-analyzer.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../..');
const JAVA_PACKAGE = 'languages/java/';
const HAND_WRITTEN_ROUTE =
  /add an exception for|"exceptions" entry for|If it is right here|To allow it here|to "exceptions" in nitpicker/u;
const OTHER_RULES_ROUTE = new Map([
  [
    'adapters/suppressions/java-suppressions.mjs',
    'names the route of the rule a suppression hides',
  ],
  [
    'adapters/suppressions/errorprone/errorprone-escapes.mjs',
    'names the route of the Error Prone check a suppression hides',
  ],
  [
    'adapters/kotlin/rules/kotlin-suppressions.mjs',
    'names the route of the rule a suppression hides',
  ],
  [
    'adapters/kotlin/review-rules/review-finding.mjs',
    'the Kotlin review rules, which the Kotlin preset routes by their own rule',
  ],
]);

function messageSources() {
  return configurationFiles()
    .filter((file) => file.startsWith(JAVA_PACKAGE))
    .map((file) => file.slice(JAVA_PACKAGE.length));
}

describe('Java finding messages', () => {
  it('in every file that shapes findings get their exception route only from applyRuleMessages', () => {
    const handWritten = messageSources()
      .filter((file) => !OTHER_RULES_ROUTE.has(file))
      .flatMap((file) =>
        readFileSync(path.join(packageRoot, JAVA_PACKAGE, file), 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            HAND_WRITTEN_ROUTE.test(line) ? [`${file}:${String(index + 1)}`] : [],
          ),
      );

    expect(handWritten).toEqual([]);
  });

  it('list only files that still hold a route for another rule', () => {
    const stale = [...OTHER_RULES_ROUTE.keys()].filter(
      (file) =>
        !HAND_WRITTEN_ROUTE.test(readFileSync(path.join(packageRoot, JAVA_PACKAGE, file), 'utf8')),
    );

    expect(stale).toEqual([]);
  });
});
