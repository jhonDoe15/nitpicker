import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  JAVA_FORMATTERS,
  KOTLIN_FORMATTERS,
  formatterOptionFlags,
  javaFormatterCommand,
} from './jvm-formatters.mjs';
import { byText } from '../../../../shared/text-order/by-text.mjs';

const INIT_SCRIPT = ['nitpicker.init.gradle', 'kotlin/kotlin-format.gradle']
  .map((file) => readFileSync(path.resolve(import.meta.dirname, '../../gradle', file), 'utf8'))
  .join('\n');
const GROOVY_PINNED = new Proxy({}, { get: (target, name) => `\${pinned.${String(name)}}` });
const FORMATTERS = [...Object.values(JAVA_FORMATTERS), ...Object.values(KOTLIN_FORMATTERS)];

function initScriptCoordinates() {
  return [...INIT_SCRIPT.matchAll(/nitpicker(?:Format|Ktlint|Ktfmt)\(?\s*"([^"]+)"/gu)].map(
    (match) => match[1].replace(/\$\{javaFormatterVersion \?: ([^}]+)\}/u, `\${$1}`),
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
    expect(initScriptCoordinates().sort(byText)).toEqual(
      [...new Set(FORMATTERS.map(({ coordinates }) => coordinates(GROOVY_PINNED)))].sort(byText),
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

describe('formatterOptionFlags', () => {
  const both = ['skipJavadocFormatting', 'skipReflowingLongStrings'];

  it('turns the skipped options into the flags of google-java-format', () => {
    expect(formatterOptionFlags('google', { options: both })).toEqual([
      '--skip-javadoc-formatting',
      '--skip-reflowing-long-strings',
    ]);
    expect(formatterOptionFlags('aosp', { version: '1.17.0', options: both })).toHaveLength(2);
    expect(formatterOptionFlags('google', { options: [] })).toEqual([]);
    expect(formatterOptionFlags('google', {})).toEqual([]);
  });

  it('passes no flag to a google-java-format release that does not have them', () => {
    expect(formatterOptionFlags('google', { version: '1.7', options: both })).toEqual([]);
    expect(formatterOptionFlags('google', { version: '1.8', options: both })).toHaveLength(2);
  });

  it('gives palantir-java-format only the reflow flag, since its command line cannot skip Javadoc', () => {
    expect(formatterOptionFlags('palantir', { options: both })).toEqual([
      '--skip-reflowing-long-strings',
    ]);
  });

  it('builds coordinates from a declared version, and from the pin without one', () => {
    const pinned = { googleJavaFormat: '1.35.0', palantirJavaFormat: '2.90.0' };

    expect(JAVA_FORMATTERS.google.coordinates(pinned)).toBe(
      'com.google.googlejavaformat:google-java-format:1.35.0',
    );
    expect(JAVA_FORMATTERS.palantir.coordinates(pinned, '2.50.0')).toBe(
      'com.palantir.javaformat:palantir-java-format:2.50.0',
    );
  });
});
