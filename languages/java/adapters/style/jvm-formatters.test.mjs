import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { JAVA_FORMATTERS, KOTLIN_FORMATTERS, javaFormatterCommand } from './jvm-formatters.mjs';

const INIT_SCRIPT = readFileSync(
  path.resolve(import.meta.dirname, '../../gradle/nitpicker.init.gradle'),
  'utf8',
);
const GROOVY_PINNED = new Proxy({}, { get: (target, name) => `\${pinned.${String(name)}}` });
const FORMATTERS = [...Object.values(JAVA_FORMATTERS), ...Object.values(KOTLIN_FORMATTERS)];

function initScriptCoordinates() {
  return [...INIT_SCRIPT.matchAll(/nitpicker(?:Format|Ktlint|Ktfmt)\(?\s*"([^"]+)"/gu)].map(
    (match) => match[1],
  );
}

function initScriptMainClasses() {
  return new Set(
    [...INIT_SCRIPT.matchAll(/'((?:com|org|io|net|edu)\.[\w.]+\.Main)'/gu)].map(
      (match) => match[1],
    ),
  );
}

describe('the formatter table', () => {
  it('names the jars the Gradle init script resolves for the format checks', () => {
    expect(initScriptCoordinates().sort()).toEqual(
      [...new Set(FORMATTERS.map(({ coordinates }) => coordinates(GROOVY_PINNED)))].sort(),
    );
  });
  it('names main classes the Gradle init script runs', () => {
    const mainClasses = [...new Set(FORMATTERS.map(({ mainClass }) => mainClass))];

    expect(mainClasses.filter((mainClass) => initScriptMainClasses().has(mainClass))).toEqual(
      mainClasses,
    );
  });
  it('passes the same style flags as the Gradle format check', () => {
    const flags = Object.entries(JAVA_FORMATTERS)
      .filter(([, { flags: styleFlags }]) => styleFlags.length > 0)
      .map(
        ([style, { flags: styleFlags }]) =>
          `${style}: [${styleFlags.map((flag) => `'${flag}'`).join(', ')}]`,
      )
      .join(', ');

    expect(
      INIT_SCRIPT.split('\n').filter((line) => line.includes(`[${flags}][javaStyle]`)).length,
    ).toBe(1);
  });
  it('prints the command a person runs to format by hand', () => {
    expect(Object.keys(JAVA_FORMATTERS).map(javaFormatterCommand)).toEqual([
      'google-java-format --replace <Java files>',
      'google-java-format --aosp --replace <Java files>',
      'palantir-java-format --palantir --replace <Java files>',
    ]);
  });
});
