import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../java-build.mjs';
import { readZip } from '../zip-entries.mjs';

const TREE_WALKER = '<module name="TreeWalker">';
const INLINE_CHECKSTYLE_FILTERS = [
  'SuppressWarningsFilter',
  'SuppressWarningsHolder',
  'SuppressionCommentFilter',
  'SuppressWithNearbyCommentFilter',
  'SuppressWithNearbyTextFilter',
  'SuppressWithPlainTextCommentFilter',
  'SuppressionXpathFilter',
];
const CAMEL_CASE_NAMES = ['MemberName', 'MethodName'];
const CAMEL_CASE_FORMAT = '^[a-z]([a-z0-9][a-zA-Z0-9]*)?$';

function withCamelCaseNames(config) {
  return CAMEL_CASE_NAMES.reduce((current, name) => {
    const format = new RegExp(
      `(<module name="${name}">\\s*<property name="format" value=")[^"]*(")`,
      'u',
    );
    if (!format.test(current)) {
      throw new Error(`nitpicker could not find ${name} in google_checks.xml`);
    }
    return current.replace(format, (_, before, after) => `${before}${CAMEL_CASE_FORMAT}${after}`);
  }, config);
}

export function nitpickerCheckstyleConfig(bundled) {
  const text = INLINE_CHECKSTYLE_FILTERS.reduce(
    (current, name) =>
      current.replaceAll(
        new RegExp(`<module name="${name}"\\s*(?:/>|>[\\s\\S]*?</module>)`, 'gu'),
        '',
      ),
    bundled,
  );
  const left = INLINE_CHECKSTYLE_FILTERS.filter((name) => text.includes(`"${name}"`));
  if (left.length > 0) {
    throw new Error(`nitpicker could not remove ${left.join(', ')} from google_checks.xml`);
  }
  return withCamelCaseNames(text);
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
  return config.replace(TREE_WALKER, () => `${TREE_WALKER}\n${modules}`);
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
