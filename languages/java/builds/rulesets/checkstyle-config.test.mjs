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

const TODO_FORMAT = [
  '<module name="TodoComment"><property name="id" value="TodoFormat"/>',
  '<property name="format" value="^[ \\t]*(?!TODO\\b)(?i:TODO)\\b"/>',
  '<message key="todo.match" value="The TODO tag must be written in capitals."/></module>',
].join('');
const SCOPED = [
  '<module name="SuppressionXpathSingleFilter"><property name="checks" value="Indentation"/>',
  '<property name="query" value="//TEXT_BLOCK_LITERAL_END"/></module>',
  '\n<module name="SuppressionXpathSingleFilter">',
  '<property name="checks" value="GoogleNonConstantFieldName"/>',
  `<property name="query" value="//VARIABLE_DEF/IDENT[matches(@text, '^[a-z]$')]"/></module>`,
].join('');
const METHOD_NAME = '<module name="MethodName"><property name="format" value="x"/></module>';
const FIELD_RULE = 'GoogleNonConstantFieldName';
const FIELD_NAME = `<module name="${FIELD_RULE}"/>`;
const ACCEPTED = [true, true];
const REJECTED = [false, false];
const DIGIT_UNDERSCORE = (check) =>
  `<module name="${check}"><property name="id" value="GoogleNonConstantFieldName"/>` +
  '<property name="format" value="^[^_]*$|(?&lt;!\\d)_|_(?!\\d)"/>' +
  `<message key="name.invalidPattern" value="Non-constant field name ''{0}'' must be lowerCamelCase, ` +
  'with no underscore, not even between digits."/></module>';
const FIELD_NAMES = [
  '<module name="GoogleNonConstantFieldName"><message key="google.non.constant.field.name.format" ',
  `value="Non-constant field name ''{0}'' must be lowerCamelCase: start lowercase, be at least 2 `,
  'chars, avoid a single lowercase letter followed by uppercase, and contain only letters and ',
  'digits."/></module>',
  DIGIT_UNDERSCORE('MemberName'),
  DIGIT_UNDERSCORE('StaticVariableName'),
].join('');
const TODO = [
  '<module name="TodoComment">',
  '  <property name="id" value="TodoFormat"/>',
  '  <property name="format" value="^[ \\t]*(?!TODO:)(?i:TODO)\\b:?"/>',
  '</module>',
].join('\n');

describe('nitpickerCheckstyleConfig', () => {
  it('drops the inline suppression filters and the text block check google-java-format contradicts', () => {
    const bundled = [
      '<module name="Checker">',
      '  <module name="SuppressWarningsFilter"/>',
      '  <module name="SuppressWithNearbyCommentFilter">',
      '    <property name="commentFormat" value="x"/>',
      '  </module>',
      '  <module name="TreeWalker"><module name="SuppressWarningsHolder" />',
      '  <module name="TextBlockGoogleStyleFormatting"/>',
      `  ${METHOD_NAME}`,
      `  ${FIELD_NAME}`,
      TODO,
      '</module>',
      '</module>',
    ].join('\n');

    expect(nitpickerCheckstyleConfig(bundled)).toBe(
      [
        '<module name="Checker">',
        '  ',
        '  ',
        `  <module name="TreeWalker">\n${SCOPED}`,
        '  ',
        `  <module name="MethodName"><property name="format" value="${CAMEL_CASE}"/></module>`,
        `  ${FIELD_NAMES}`,
        TODO_FORMAT,
        '</module>',
        '</module>',
      ].join('\n'),
    );
  });

  it.each([
    ['MethodName', `<module name="TreeWalker">${FIELD_NAME}${TODO}</module>`],
    ['GoogleNonConstantFieldName', `<module name="TreeWalker">${METHOD_NAME}${TODO}</module>`],
    ['TodoFormat', `<module name="TreeWalker">${METHOD_NAME}${FIELD_NAME}</module>`],
    ['TreeWalker', `<module name="Checker">${METHOD_NAME}${FIELD_NAME}${TODO}</module>`],
  ])('fails when the bundled checks have no %s to adapt', (name, bundled) => {
    expect(() => nitpickerCheckstyleConfig(bundled)).toThrow(
      new Error(`nitpicker could not find ${name} in google_checks.xml`),
    );
  });

  it('flags the underscore between digits that GoogleNonConstantFieldName accepts, in every field', () => {
    const bundled = `<module name="TreeWalker">${METHOD_NAME}${FIELD_NAME}${TODO}</module>`;
    const strict = parseXml(nitpickerCheckstyleConfig(bundled)).children.filter((element) =>
      ['MemberName', 'StaticVariableName'].includes(element.attrs?.name),
    );
    const settings = strict.map((element) =>
      Object.fromEntries(
        childrenNamed(element, 'property').map(({ attrs }) => [attrs.name, attrs.value]),
      ),
    );
    const accepted = (name) => settings.map(({ format }) => new RegExp(format, 'u').test(name));

    expect(settings.map(({ id }) => id)).toEqual([FIELD_RULE, FIELD_RULE]);
    expect(['version1_2', 'count10_20', 'a1_2b'].map(accepted)).toEqual(Array(3).fill(REJECTED));
    expect(['version12', 'userId', 'x', 'user_id'].map(accepted)).toEqual(Array(4).fill(ACCEPTED));
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
    const jar = path.join(directory, 'checkstyle-13.5.0.jar');
    const bundled = [
      '<module name="Checker">',
      '<module name="TreeWalker">',
      METHOD_NAME,
      FIELD_NAME,
      TODO,
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
      'SuppressionXpathSingleFilter',
      'SuppressionXpathSingleFilter',
      'MethodName',
      'GoogleNonConstantFieldName',
      'MemberName',
      'StaticVariableName',
      'TodoComment',
    ]);
    expect(names(written.test).map((module) => module.name)).toEqual([
      'ConstantName',
      'SuppressionXpathSingleFilter',
      'SuppressionXpathSingleFilter',
      'SuppressionXpathSingleFilter',
      'MethodName',
      'GoogleNonConstantFieldName',
      'MemberName',
      'StaticVariableName',
      'TodoComment',
    ]);
  });
});
