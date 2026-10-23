import { GLOB_PROBLEMS } from '../../../shared/config.mjs';
import { toolsOf } from '../../../shared/exceptions/rule-tools.mjs';

export const ABSOLUTE_PATH = String.raw`^(?:/|[A-Za-z]:)`;
const PARENT_SEGMENT = String.raw`(?:^|[/\\])\.\.(?:[/\\]|$)`;
const GLOB_CHARACTERS = String.raw`[*?{}\[\]]`;
const EMPTY_DIRECTORY = String.raw`^(?:\.[/\\]?)?$`;

export const nonEmptyString = { type: 'string', minLength: 1 };

export function ref(name) {
  return { $ref: `#/definitions/${name}` };
}

export function forbid(keys) {
  return Object.fromEntries(keys.map((key) => [key, false]));
}

export function without(allowed, universe) {
  return universe.filter((key) => !allowed.includes(key));
}

export function never(pattern) {
  return { not: { pattern } };
}

export function stringArray(description, extra = {}) {
  return { description, type: 'array', items: nonEmptyString, ...extra };
}

export function enumeration(description, values) {
  return { description, enum: values };
}

export function ruleSpellings(rules) {
  return [...new Set(rules.flatMap((rule) => [rule, ...(toolsOf(rule) ?? []).map(spelled(rule))]))];
}

function spelled(rule) {
  return (tool) => `${tool}/${rule}`;
}

export const projectPath = {
  type: 'string',
  minLength: 1,
  allOf: [never(ABSOLUTE_PATH), never(PARENT_SEGMENT)],
};

export const directory = {
  ...projectPath,
  allOf: [...projectPath.allOf, never(GLOB_CHARACTERS), never(EMPTY_DIRECTORY)],
};

const globProblemChecks = GLOB_PROBLEMS.filter(({ pattern }) => pattern !== undefined).map(
  ({ pattern }) => never(pattern.source),
);

const fileGlob = { type: 'string', minLength: 1, allOf: globProblemChecks };

const folderGlob = {
  ...projectPath,
  allOf: [...projectPath.allOf, ...globProblemChecks],
};

export const positiveInteger = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };

export const sharedDefinitions = { fileGlob, folderGlob };
