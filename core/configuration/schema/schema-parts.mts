import {
  DRIVE_LETTER,
  GLOB_CHARACTER,
  GLOB_PROBLEMS,
  PARENT_SEGMENT,
} from '../../../shared/config.mjs';
import { toolsOf } from '../views/schema-views.mts';

export type JsonSchema = { readonly [keyword: string]: unknown };

export const ABSOLUTE_PATH = `^/|${DRIVE_LETTER.source}`;
const EMPTY_DIRECTORY = String.raw`^(?:\.[/\\]?)?$`;

export const nonEmptyString = { type: 'string', minLength: 1 };

export function ref(name: string): JsonSchema {
  return { $ref: `#/definitions/${name}` };
}

export function forbid(keys: readonly string[]): Record<string, false> {
  return Object.fromEntries(keys.map((key) => [key, false]));
}

export function without(allowed: readonly string[], universe: readonly string[]): string[] {
  return universe.filter((key) => !allowed.includes(key));
}

export function never(pattern: string): JsonSchema {
  return { not: { pattern } };
}

export function stringArray(description: string, extra: JsonSchema = {}): JsonSchema {
  return { description, type: 'array', items: nonEmptyString, ...extra };
}

export function enumeration(description: string, values: readonly string[]): JsonSchema {
  return { description, enum: values };
}

export function ruleSpellings(rules: readonly string[]): string[] {
  return [...new Set(rules.flatMap((rule) => [rule, ...(toolsOf(rule) ?? []).map(spelled(rule))]))];
}

function spelled(rule: string): (tool: string) => string {
  return (tool: string) => `${tool}/${rule}`;
}

export const projectPath = {
  type: 'string',
  minLength: 1,
  allOf: [never(ABSOLUTE_PATH), never(PARENT_SEGMENT.source)],
};

export const directory = {
  ...projectPath,
  allOf: [...projectPath.allOf, never(GLOB_CHARACTER.source), never(EMPTY_DIRECTORY)],
};

const globProblemChecks = GLOB_PROBLEMS.flatMap(({ pattern }) =>
  pattern === undefined ? [] : [never(pattern.source)],
);

const fileGlob = { type: 'string', minLength: 1, allOf: globProblemChecks };

const folderGlob = {
  ...projectPath,
  allOf: [...projectPath.allOf, ...globProblemChecks],
};

export const positiveInteger = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };

export const sharedDefinitions = { fileGlob, folderGlob };
