import { readFileSync } from 'node:fs';
import path from 'node:path';
import { escapeRegExp } from '../typed/regex-views.mts';
import { GRADLE_DIRECTORY } from '../java-build.mts';

const INLINE_CHECKSTYLE_FILTERS = [
  'SuppressWarningsFilter',
  'SuppressWarningsHolder',
  'SuppressionCommentFilter',
  'SuppressWithNearbyCommentFilter',
  'SuppressWithNearbyTextFilter',
  'SuppressWithPlainTextCommentFilter',
  'SuppressionXpathFilter',
];
const FORMATTER_CONFLICTS = ['TextBlockGoogleStyleFormatting'];
const TREE_WALKER = '<module name="TreeWalker">';
const RELAXED_NAME = '^[a-z]([a-z0-9][a-zA-Z0-9]*)?$';
const METHOD_NAME = /(<module name="MethodName">\s*<property name="format"\s+value=")[^"]*(")/u;
const TODO_FORMAT =
  /<module name="TodoComment">\s*<property name="id" value="TodoFormat"\/>[\s\S]*?<\/module>/u;
const TODO_CASE =
  '<module name="TodoComment"><property name="id" value="TodoFormat"/>' +
  '<property name="format" value="^[ \\t]*(?!TODO\\b)(?i:TODO)\\b"/>' +
  '<message key="todo.match" value="The TODO tag must be written in capitals."/></module>';
const FIELD_RULE = 'GoogleNonConstantFieldName';
const NON_CONSTANT_FIELD_NAME = /<module name="GoogleNonConstantFieldName"\s*\/>/u;
const NO_DIGIT_UNDERSCORE = '^[^_]*$|(?&lt;!\\d)_|_(?!\\d)';
const FIELD_MESSAGE =
  "Non-constant field name ''{0}'' must be lowerCamelCase: start lowercase, contain only " +
  'letters and digits, and not follow a single lowercase letter with an uppercase one.';
const DIGIT_UNDERSCORE_MESSAGE =
  "Non-constant field name ''{0}'' must be lowerCamelCase, with no underscore, not even between " +
  'digits.';
type Edit = {
  readonly pattern: RegExp;
  readonly replacement: (...groups: string[]) => string;
  readonly name: string;
};

const SCOPED_CHECKS: readonly (readonly [string, string])[] = [
  ['Indentation', '//TEXT_BLOCK_LITERAL_END'],
  [FIELD_RULE, "//VARIABLE_DEF/IDENT[matches(@text, '^[a-z]$')]"],
];

function moduleElement(name: string): RegExp {
  return new RegExp(`<module name="${escapeRegExp(name)}"\\s*(?:/>|>[\\s\\S]*?</module>)`, 'gu');
}

function withoutModules(text: string, names: readonly string[]): string {
  const left = names.reduce((current, name) => current.replaceAll(moduleElement(name), ''), text);
  const kept = names.filter((name) => left.includes(`"${name}"`));
  if (kept.length > 0) {
    throw new Error(`nitpicker could not remove ${kept.join(', ')} from google_checks.xml`);
  }
  return left;
}

function replaced(text: string, { pattern, replacement, name }: Edit): string {
  if (!pattern.test(text)) {
    throw new Error(`nitpicker could not find ${name} in google_checks.xml`);
  }
  return text.replace(pattern, replacement);
}

function scopedChecks() {
  return SCOPED_CHECKS.map(
    ([checks, query]) =>
      `<module name="SuppressionXpathSingleFilter"><property name="checks" value="${checks}"/>` +
      `<property name="query" value="${query}"/></module>`,
  ).join('\n');
}

function digitUnderscoreModule(check: string): string {
  return (
    `<module name="${check}"><property name="id" value="${FIELD_RULE}"/>` +
    `<property name="format" value="${NO_DIGIT_UNDERSCORE}"/>` +
    `<message key="name.invalidPattern" value="${DIGIT_UNDERSCORE_MESSAGE}"/></module>`
  );
}

function fieldNameModules() {
  return [
    `<module name="${FIELD_RULE}">`,
    `<message key="google.non.constant.field.name.format" value="${FIELD_MESSAGE}"/></module>`,
    digitUnderscoreModule('MemberName'),
    digitUnderscoreModule('StaticVariableName'),
  ].join('');
}

const EDITS: readonly Edit[] = [
  {
    pattern: METHOD_NAME,
    replacement: (_whole, head, tail) => `${head}${RELAXED_NAME}${tail}`,
    name: 'MethodName',
  },
  { pattern: NON_CONSTANT_FIELD_NAME, replacement: fieldNameModules, name: FIELD_RULE },
  { pattern: TODO_FORMAT, replacement: () => TODO_CASE, name: 'TodoFormat' },
  {
    pattern: new RegExp(TREE_WALKER, 'u'),
    replacement: () => `${TREE_WALKER}\n${scopedChecks()}`,
    name: 'TreeWalker',
  },
];

export function nitpickerCheckstyleConfig(bundled: string): string {
  const filtered = withoutModules(bundled, [...INLINE_CHECKSTYLE_FILTERS, ...FORMATTER_CONFLICTS]);
  return EDITS.reduce(replaced, filtered);
}

function checkstyleRuleModules(file: string): string {
  const text = readFileSync(path.join(GRADLE_DIRECTORY, 'rules', path.basename(file)), 'utf8');
  const modules = /<modules>([\s\S]*)<\/modules>/u.exec(text)?.[1];
  if (modules === undefined) {
    throw new Error(`nitpicker could not find <modules> in ${file}`);
  }
  return modules;
}

export function withGuardChecks(config: string, files: readonly string[]): string {
  if (!config.includes(TREE_WALKER)) {
    throw new Error('nitpicker could not find TreeWalker in google_checks.xml');
  }
  const modules = files.map((file) => checkstyleRuleModules(file)).join('\n');
  return config.replace(TREE_WALKER, () => `${TREE_WALKER}\n${modules}`);
}
