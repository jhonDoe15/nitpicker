import path from 'node:path';
import type TypeScript from 'typescript';
import { isRecord as untypedIsRecord } from '../../../shared/rules/facts/checks.mts';
import { fieldOf, fieldsOf, listOf } from '../../../shared/values/readers.mts';

type CompilerOptions = TypeScript.CompilerOptions;

const isRecord: (value: unknown) => boolean = untypedIsRecord;

const REMOVED_ENUM_VALUES: Readonly<Record<string, ReadonlySet<unknown>>> = {
  target: new Set([1]),
  module: new Set([2, 3, 4]),
  moduleResolution: new Set([1, 2]),
};
const REMOVED_FALSE_OPTIONS = ['esModuleInterop', 'allowSyntheticDefaultImports', 'alwaysStrict'];
const REMOVED_OPTIONS = ['downlevelIteration', 'outFile', 'out'];

export function removedOptions(options: CompilerOptions): string[] {
  return [
    ...Object.entries(REMOVED_ENUM_VALUES)
      .filter(([option, values]) => values.has(options[option]))
      .map(([option]) => option),
    ...REMOVED_FALSE_OPTIONS.filter((option) => options[option] === false),
    ...REMOVED_OPTIONS.filter((option) => options[option] !== undefined),
  ];
}

export function baseUrlOf(options: CompilerOptions): string | undefined {
  const baseUrl = fieldOf(options, 'baseUrl');
  return typeof baseUrl === 'string' ? baseUrl : undefined;
}

export function baseUrlPaths(options: CompilerOptions): Readonly<Record<string, unknown>> {
  const baseUrl = baseUrlOf(options);
  return baseUrl === undefined ? {} : absolutePaths(baseUrl, options.paths);
}

function absolutePaths(baseUrl: string, paths: unknown): Readonly<Record<string, unknown>> {
  if (paths !== undefined && !isRecord(paths)) {
    return {};
  }
  const mapped = Object.fromEntries(
    Object.entries(fieldsOf(paths)).map(([pattern, targets]) => [
      pattern,
      Array.isArray(targets) ? targets.map((target) => absoluteTarget(baseUrl, target)) : targets,
    ]),
  );
  return { paths: { ...mapped, '*': withBareLookup(mapped['*'], absoluteTarget(baseUrl, '*')) } };
}

function withBareLookup(targets: unknown, bareTarget: unknown): unknown {
  if (targets === undefined) {
    return [bareTarget];
  }
  return Array.isArray(targets) ? [...listOf(targets), bareTarget] : targets;
}

function absoluteTarget(baseUrl: string, target: unknown): unknown {
  return typeof target === 'string' ? path.resolve(baseUrl, target).replaceAll('\\', '/') : target;
}
