import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { childrenNamed, parseXml } from '../../ingest/common.mjs';
import { zipOf } from '../test-support/zip-writer.mjs';
import {
  nitpickerCheckstyleConfig,
  withGuardChecks,
  writeCheckstyleConfigs,
} from './checkstyle-config.mjs';

const CAMEL_CASE = '^[a-z]([a-z0-9][a-zA-Z0-9]*)?$';
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function leaf(name) {
  return { name, modules: [] };
}

function moduleTree(element) {
  return { name: element.attrs.name, modules: childrenNamed(element, 'module').map(moduleTree) };
}

describe('nitpickerCheckstyleConfig', () => {
  it('drops every inline suppression filter and allows one-letter camel-case prefixes in names', () => {
    const bundled = [
      '<module name="Checker">',
      '  <module name="SuppressWarningsFilter"/>',
      '  <module name="MemberName">',
      '    <property name="format" value="^[a-z][a-z0-9][a-zA-Z0-9]*$"/>',
      '  </module>',
      '  <module name="MethodName"><property name="format" value="x"/></module>',
      '  <module name="SuppressWithNearbyCommentFilter">',
      '    <property name="commentFormat" value="x"/>',
      '  </module>',
      '  <module name="TreeWalker"><module name="SuppressWarningsHolder" /></module>',
      '</module>',
    ].join('\n');

    expect(nitpickerCheckstyleConfig(bundled)).toBe(
      [
        '<module name="Checker">',
        '  ',
        '  <module name="MemberName">',
        `    <property name="format" value="${CAMEL_CASE}"/>`,
        '  </module>',
        `  <module name="MethodName"><property name="format" value="${CAMEL_CASE}"/></module>`,
        '  ',
        '  <module name="TreeWalker"></module>',
        '</module>',
      ].join('\n'),
    );
  });

  it('fails when the bundled checks have no member name format', () => {
    expect(() => nitpickerCheckstyleConfig('<module name="Checker"/>')).toThrow(
      new Error('nitpicker could not find MemberName in google_checks.xml'),
    );
  });
});

describe('withGuardChecks', () => {
  const config =
    '<module name="Checker"><module name="TreeWalker"><module name="A"/></module></module>';

  it('adds the modules of the guard rule files at the start of the TreeWalker', () => {
    const merged = withGuardChecks(config, ['checkstyle-all.xml', 'checkstyle-main.xml']);

    expect(moduleTree(parseXml(merged))).toEqual({
      name: 'Checker',
      modules: [
        {
          name: 'TreeWalker',
          modules: [
            leaf('ConstantName'),
            leaf('SuppressionXpathSingleFilter'),
            leaf('MagicNumber'),
            leaf('VisibilityModifier'),
            leaf('SuppressionXpathSingleFilter'),
            leaf('SuppressionXpathSingleFilter'),
            leaf('A'),
          ],
        },
      ],
    });
  });

  it('adds only the modules of the files it is given', () => {
    const merged = withGuardChecks(config, ['checkstyle-all.xml']);

    expect(moduleTree(parseXml(merged))).toEqual({
      name: 'Checker',
      modules: [
        {
          name: 'TreeWalker',
          modules: [leaf('ConstantName'), leaf('SuppressionXpathSingleFilter'), leaf('A')],
        },
      ],
    });
  });

  it('makes the TreeWalker skip a file it cannot parse instead of failing the run', () => {
    const treeWalker = parseXml(withGuardChecks(config, []))
      .children.filter((element) => element.name === 'module')
      .find((element) => element.attrs.name === 'TreeWalker');

    expect(
      childrenNamed(treeWalker, 'property').map(({ attrs }) => [attrs.name, attrs.value]),
    ).toEqual([['skipFileOnJavaParseException', 'true']]);
  });

  it('fails when the bundled checks have no TreeWalker', () => {
    expect(() => withGuardChecks('<module name="Checker"/>', ['checkstyle-all.xml'])).toThrow(
      new Error('nitpicker could not find TreeWalker in google_checks.xml'),
    );
  });
});

describe('writeCheckstyleConfigs', () => {
  it('writes the main and test configs from the google_checks.xml of the Checkstyle jar', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-checkstyle-config-'));
    roots.push(directory);
    const jar = path.join(directory, 'checkstyle-10.21.1.jar');
    const bundled = [
      '<module name="Checker">',
      '<module name="TreeWalker">',
      '<module name="MemberName"><property name="format" value="a"/></module>',
      '<module name="MethodName"><property name="format" value="b"/></module>',
      '</module>',
      '</module>',
    ].join('');
    writeFileSync(jar, zipOf({ 'google_checks.xml': bundled }));

    const written = writeCheckstyleConfigs({ checkstyleJar: jar, directory });

    const names = (file) => moduleTree(parseXml(readFileSync(file, 'utf8'))).modules[0].modules;
    expect(written).toEqual({
      main: path.join(directory, 'checkstyle.xml'),
      test: path.join(directory, 'checkstyle-test.xml'),
    });
    expect(names(written.main).map((module) => module.name)).toEqual([
      'ConstantName',
      'SuppressionXpathSingleFilter',
      'MagicNumber',
      'VisibilityModifier',
      'SuppressionXpathSingleFilter',
      'SuppressionXpathSingleFilter',
      'MemberName',
      'MethodName',
    ]);
    expect(names(written.test).map((module) => module.name)).toEqual([
      'ConstantName',
      'SuppressionXpathSingleFilter',
      'MemberName',
      'MethodName',
    ]);
  });
});
