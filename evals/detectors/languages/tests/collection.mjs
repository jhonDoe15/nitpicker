import { isBuildFile, isCollectedPythonFile } from '../project-files.mjs';

/**
 * Which JUnit generations the project's build files run: `{ known, jupiter, junit4 }`. Jupiter
 * runs under `useJUnitPlatform()` or a `junit-jupiter` dependency; JUnit 4 tests run under
 * `useJUnit()`, or on the platform only with the vintage engine.
 */
export function junitPlatformOf(tree) {
  const text = [...tree]
    .filter(([file]) => isBuildFile(file))
    .map(([, content]) => content)
    .join('\n');
  const jupiter = /useJUnitPlatform|junit-jupiter|junit\.jupiter/u.test(text);
  const vintage = /junit-vintage|vintage-engine/u.test(text);
  const legacy = /\bjunit:junit\b|<artifactId>junit<\/artifactId>|useJUnit\(\)/u.test(text);
  return {
    known: jupiter || vintage || legacy,
    jupiter: jupiter || !legacy,
    junit4: vintage || (legacy && !jupiter),
  };
}

/**
 * Whether a runner would run a parsed test: a pytest file named `test_*.py` or `*_test.py` and a
 * class pytest collects; for JVM tests a method a runner can call (not private, not in an abstract
 * class) whose JUnit generation the build runs.
 */
export function isLive({ language, file, test, platform }) {
  if (!test.collected) return false;
  if (language === 'python') return isCollectedPythonFile(file);
  if (!platform.known || test.family === 'other') return true;
  return test.family === 'junit4' ? platform.junit4 : platform.jupiter;
}
