import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../java-build.mjs';
import { readZip } from '../zip-entries.mjs';

const TREE_WALKER = '<module name="TreeWalker">';
const TREE_WALKER_START = /<module name="TreeWalker">/u;
const SKIP_UNPARSEABLE = '<property name="skipFileOnJavaParseException" value="true"/>';
const INLINE_CHECKSTYLE_FILTERS = [
  'SuppressWarningsFilter',
  'SuppressWarningsHolder',
  'SuppressionCommentFilter',
  'SuppressWithNearbyCommentFilter',
  'SuppressWithNearbyTextFilter',
  'SuppressionXpathFilter',
];
const FORMATTER_CONFLICTS = ['TextBlockGoogleStyleFormatting'];
const CAMEL_CASE_FORMAT = '^[a-z]([a-z0-9][a-zA-Z0-9]*)?$';
const METHOD_NAME_FORMAT =
  /(<module name="MethodName">\s*<property name="format"\s+value=")[^"]*(")/u;
const TODO_FORMAT =
  /<module name="TodoComment">\s*<property name="id" value="TodoFormat"\/>[\s\S]*?<\/module>/u;
const TODO_CASE =
  '<module name="TodoComment"><property name="id" value="TodoFormat"/>' +
  '<property name="format" value="^[ \\t]*(?!TODO\\b)(?i:TODO)\\b"/>' +
  '<message key="todo.match" value="The TODO tag must be written in capitals."/></module>';
const NON_CONSTANT_FIELD_NAME = /<module name="GoogleNonConstantFieldName"\s*\/>/u;
const FIELD_RULE = 'GoogleNonConstantFieldName';
const NO_DIGIT_UNDERSCORE = '^[^_]*$|(?&lt;!\\d)_|_(?!\\d)';
const FIELD_MESSAGE =
  "Non-constant field name ''{0}'' must be lowerCamelCase: start lowercase, be at least 2 " +
  'chars, avoid a single lowercase letter followed by uppercase, and contain only letters and ' +
  'digits.';
const DIGIT_UNDERSCORE_MESSAGE =
  "Non-constant field name ''{0}'' must be lowerCamelCase, with no underscore, not even between " +
  'digits.';
const SCOPED_CHECKS = [
  ['Indentation', '//TEXT_BLOCK_LITERAL_END'],
  ['GoogleNonConstantFieldName', "//VARIABLE_DEF/IDENT[matches(@text, '^[a-z]$')]"],
];

function moduleElement(name) {
  return new RegExp(`<module name="${name}"\\s*(?:/>|>[\\s\\S]*?</module>)`, 'gu');
}

function withoutModules(config, names) {
  const text = names.reduce((current, name) => current.replaceAll(moduleElement(name), ''), config);
  const left = names.filter((name) => text.includes(`"${name}"`));
  if (left.length > 0) {
    throw new Error(`nitpicker could not remove ${left.join(', ')} from google_checks.xml`);
  }
  return text;
}

function replaced(config, { pattern, replacement, name }) {
  if (!pattern.test(config)) {
    throw new Error(`nitpicker could not find ${name} in google_checks.xml`);
  }
  return config.replace(pattern, replacement);
}

function scopedChecks() {
  return SCOPED_CHECKS.map(
    ([checks, query]) =>
      `<module name="SuppressionXpathSingleFilter"><property name="checks" value="${checks}"/>` +
      `<property name="query" value="${query}"/></module>`,
  ).join('\n');
}

function fieldNameModules() {
  const strict = (check) =>
    `<module name="${check}"><property name="id" value="${FIELD_RULE}"/>` +
    `<property name="format" value="${NO_DIGIT_UNDERSCORE}"/>` +
    `<message key="name.invalidPattern" value="${DIGIT_UNDERSCORE_MESSAGE}"/></module>`;
  return [
    `<module name="${FIELD_RULE}">`,
    `<message key="google.non.constant.field.name.format" value="${FIELD_MESSAGE}"/></module>`,
    strict('MemberName'),
    strict('StaticVariableName'),
  ].join('');
}

export function nitpickerCheckstyleConfig(bundled) {
  const filtered = withoutModules(bundled, [...INLINE_CHECKSTYLE_FILTERS, ...FORMATTER_CONFLICTS]);
  const named = replaced(filtered, {
    pattern: METHOD_NAME_FORMAT,
    replacement: (_, before, after) => `${before}${CAMEL_CASE_FORMAT}${after}`,
    name: 'MethodName',
  });
  const fields = replaced(named, {
    pattern: NON_CONSTANT_FIELD_NAME,
    replacement: fieldNameModules,
    name: FIELD_RULE,
  });
  const todo = replaced(fields, {
    pattern: TODO_FORMAT,
    replacement: () => TODO_CASE,
    name: 'TodoFormat',
  });
  return replaced(todo, {
    pattern: TREE_WALKER_START,
    replacement: () => `${TREE_WALKER}\n${scopedChecks()}`,
    name: 'TreeWalker',
  });
}

function checkstyleRuleModules(file) {
  const text = readFileSync(path.join(GRADLE_DIRECTORY, 'rules', path.basename(file)), 'utf8');
  return /<modules>([\s\S]*)<\/modules>/u.exec(text)[1];
}

export function withGuardChecks(config, files) {
  if (!config.includes(TREE_WALKER)) {
    throw new Error('nitpicker could not find TreeWalker in google_checks.xml');
  }
  const modules = files.map((file) => checkstyleRuleModules(file)).join('\n');
  return config.replace(TREE_WALKER, () => `${TREE_WALKER}\n${SKIP_UNPARSEABLE}\n${modules}`);
}

function bundledGoogleChecks(checkstyleJar) {
  const text = readZip(checkstyleJar).text('google_checks.xml');
  if (text === undefined) {
    throw new Error(`could not read google_checks.xml from ${checkstyleJar}`);
  }
  return text;
}

export function writeCheckstyleConfigs({ checkstyleJar, directory }) {
  const bundled = nitpickerCheckstyleConfig(bundledGoogleChecks(checkstyleJar));
  const main = path.join(directory, 'checkstyle.xml');
  const test = path.join(directory, 'checkstyle-test.xml');
  mkdirSync(directory, { recursive: true });
  writeFileSync(main, withGuardChecks(bundled, ['checkstyle-all.xml', 'checkstyle-main.xml']));
  writeFileSync(test, withGuardChecks(bundled, ['checkstyle-all.xml']));
  return { main, test };
}
