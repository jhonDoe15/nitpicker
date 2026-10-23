import {
  COMPILER_DIAGNOSTIC,
  EXCEPTION_KEYS,
  WINDOWS_SEPARATOR,
} from '../../../shared/exceptions/validation.mjs';
import { GLOB_PROBLEMS } from '../../../shared/config.mjs';
import {
  FUNCTION_EXCEPTION_RULES,
  FUNCTION_REQUIRED_RULES,
  NAME_EXCEPTION_RULES,
} from '../../../shared/policy.mjs';
import { PACKAGE_EXCEPTION_RULES } from '../../../shared/project-rules/hygiene-rules.mjs';
import { PYTHON_TOP_LEVEL_EXCEPTION_RULES } from '../../../languages/python/adapters/configuration/python-config.mjs';
import { JAVA_TOOLS } from '../../../languages/java/adapters/gradle-presets.mjs';
import { JAVA_EXCEPTION_RULES } from '../../../languages/java/adapters/java-policy.mjs';
import { KOTLIN_EXCEPTION_RULES } from '../../../languages/java/adapters/kotlin/kotlin-options.mjs';
import { DETEKT_RULE } from '../../../languages/java/adapters/kotlin/rules/kotlin-messages.mjs';
import { i18nRuleIds } from '../../../languages/typescript/preset/eslint-config/i18n/i18n-rules.mjs';
import { NITPICKER_RULES, RENAMED_TYPESCRIPT_RULES } from '../validate.mjs';
import { ABSOLUTE_PATH, ref, nonEmptyString, never, ruleSpellings } from './schema-parts.mjs';

const EXCEPTION_PARENT_SEGMENT = String.raw`(?:^|/)\.\.(?:/|$)`;
const NOT_BLANK = String.raw`\S`;
const HAS_LETTER_OR_DIGIT = String.raw`[\p{L}\p{N}]`;

const exceptionGlob = {
  type: 'string',
  allOf: [
    { pattern: NOT_BLANK },
    never(ABSOLUTE_PATH),
    never(WINDOWS_SEPARATOR.source),
    never(EXCEPTION_PARENT_SEGMENT),
  ],
};

const entryProperties = {
  rule: {
    description:
      'The rule to lift, as a finding prints it: a nitpicker rule such as "file-lines-limit", an ESLint, ruff or other tool rule, or "<tool>/<rule>" (for example "pmd/UnusedPrivateField"). The message of each finding prints the whole entry to copy.',
    ...nonEmptyString,
    ...never(COMPILER_DIAGNOSTIC.source),
  },
  paths: {
    description:
      'Globs, relative to the project root with "/" separators, of the files (or folders, for folder rules) the rule is lifted for.',
    type: 'array',
    minItems: 1,
    items: ref('exceptionGlob'),
  },
  packages: {
    description:
      'Package names the unused-dependency, unlisted-dependency or unresolved-import rule is lifted for.',
    type: 'array',
    minItems: 1,
    items: nonEmptyString,
  },
  function: {
    description:
      'The name of the one function the rule is lifted for. Only for the function and coverage rules; required for changed-branch-coverage.',
    type: 'string',
    pattern: NOT_BLANK,
  },
  name: {
    description:
      'The name of the one declaration the rule is lifted for. Only for the dead-code rules "exports" and "types".',
    type: 'string',
    pattern: NOT_BLANK,
  },
  reason: {
    description:
      'Why the rule is lifted here. Required, and it must say something: the "..." a message prints is refused.',
    type: 'string',
    pattern: HAS_LETTER_OR_DIGIT,
  },
};

const narrowings = [
  ['function', 'functionRule'],
  ['name', 'nameRule'],
  ['packages', 'packageRule'],
].map(([key, rules]) => ({
  if: { required: [key] },
  then: { properties: { rule: ref(rules) } },
}));

const exception = {
  description: 'One rule lifted for some paths.',
  type: 'object',
  additionalProperties: false,
  required: ['rule', 'paths', 'reason'],
  properties: Object.fromEntries(EXCEPTION_KEYS.map((key) => [key, entryProperties[key]])),
  allOf: [
    ...narrowings,
    {
      if: { required: ['rule'], properties: { rule: ref('functionRequiredRule') } },
      then: { required: ['function'] },
    },
    { not: { required: ['function', 'name'] } },
  ],
};

export const exceptionDefinitions = {
  exception,
  exceptionGlob,
  functionRule: { enum: ruleSpellings(FUNCTION_EXCEPTION_RULES) },
  functionRequiredRule: { enum: ruleSpellings(FUNCTION_REQUIRED_RULES) },
  nameRule: { enum: ruleSpellings(NAME_EXCEPTION_RULES) },
  packageRule: { enum: ruleSpellings(PACKAGE_EXCEPTION_RULES) },
  nitpickerRule: { enum: ruleSpellings(NITPICKER_RULES) },
};

export function exceptionList(description, itemRestrictions = []) {
  return {
    description,
    type: 'array',
    items:
      itemRestrictions.length === 0
        ? ref('exception')
        : { allOf: [ref('exception'), ...itemRestrictions] },
  };
}

function ruleIs(rule) {
  return { properties: { rule } };
}

export const pythonTopLevelRestriction = ruleIs({
  enum: ruleSpellings(PYTHON_TOP_LEVEL_EXCEPTION_RULES),
});

export const pythonOwnRestriction = ruleIs({
  not: { enum: ruleSpellings(PYTHON_TOP_LEVEL_EXCEPTION_RULES) },
});

const ownGlobChecks = GLOB_PROBLEMS.filter(({ pattern }) => pattern !== undefined).map(
  ({ pattern }) => never(pattern.source),
);

const javaFinding = { pattern: `^(?:${JAVA_TOOLS.join('|')})/[\\s\\S]` };

export const javaRestriction = ruleIs({
  anyOf: [{ enum: ruleSpellings(JAVA_EXCEPTION_RULES) }, javaFinding],
});

export const kotlinRestriction = ruleIs({
  anyOf: [
    { enum: ruleSpellings(KOTLIN_EXCEPTION_RULES) },
    { pattern: DETEKT_RULE.source },
    javaFinding,
  ],
});

export const pathProblemRestriction = {
  properties: { paths: { items: { allOf: ownGlobChecks } } },
};

export const typescriptRestrictions = [
  ruleIs({ not: { enum: RENAMED_TYPESCRIPT_RULES } }),
  {
    if: { required: ['rule'], properties: { rule: { pattern: '^formatjs/' } } },
    then: ruleIs({ enum: i18nRuleIds }),
  },
  {
    if: { required: ['rule'], properties: { rule: ref('nitpickerRule') } },
    then: pathProblemRestriction,
  },
];
