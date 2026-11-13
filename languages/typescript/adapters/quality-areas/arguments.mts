import { QUALITY_AREA_RUNNERS } from './registry.mts';
import type { QualityAreaOptions } from './typed/area-types.mts';
import { realpathSync, lstatSync } from 'node:fs';
import { TRUSTED_TOOL_ROOT } from './runners/tooling.mts';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { DEFAULT_LEGACY_INVENTORY } from '../../preset/coding-standards/inventory-path.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT } from '../../../../shared/policy.mjs';
import { parsePositiveNumber } from '../../preset/checks/numbers.mjs';
import { validatedSnapshotRoot } from '../static-checks/arguments.mts';
import {
  MUTATION_SCOPE_OPTION,
  parseMutationScope as parseUntypedMutationScope,
} from '../../../../core/tooling/runner-arguments.mjs';

const parseMutationScope: (text: string) => readonly string[] = parseUntypedMutationScope;

const VALUE_ARGUMENTS = new Set([
  '--analyzer-name',
  '--kind',
  '--project-root',
  '--policy-root',
  '--tool-root',
  '--live-project-root',
  '--project-policy-root',
  '--snapshot',
  '--baseline-root',
  '--baseline-moves-file',
  '--crap-score-limit',
  '--legacy-inventory',
  MUTATION_SCOPE_OPTION,
]);

export function parseArguments(arguments_: readonly string[]): QualityAreaOptions {
  const values = collectArguments(arguments_);
  const kind = supportedKind(values);
  const snapshot = snapshotOf(values);
  const toolRoot = trustedToolRoot(values);
  const projectRoot = validatedSnapshotRoot(
    requiredValue(values, '--project-root'),
    '--project-root',
  );
  const projectPolicyRoot = projectPolicyRootOf(values, projectRoot);
  return {
    analyzerName: requiredValue(values, '--analyzer-name'),
    kind,
    projectRoot,
    projectPolicyRoot,
    policyRoot: validatedSnapshotRoot(requiredValue(values, '--policy-root'), '--policy-root'),
    toolRoot,
    liveProjectRoot: optionalValue(
      values.get('--live-project-root'),
      (value: string) => realpathSync(value),
      PACKAGE_ROOT,
    ),
    snapshot,
    legacyInventory: values.get('--legacy-inventory') ?? DEFAULT_LEGACY_INVENTORY,
    crapScoreLimit: optionalValue(
      values.get('--crap-score-limit'),
      (value: string) => parsePositiveNumber(value, '--crap-score-limit'),
      DEFAULT_CRAP_SCORE_LIMIT,
    ),
    baselineRoot: optionalValue(
      values.get('--baseline-root'),
      (value: string) => validatedSnapshotRoot(value, '--baseline-root'),
      undefined,
    ),
    baselineMovesFile: optionalValue(values.get('--baseline-moves-file'), movesFileOf, undefined),
    mutationScope: optionalValue(values.get(MUTATION_SCOPE_OPTION), parseMutationScope, undefined),
  };
}

function collectArguments(arguments_: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  const remaining = arguments_.values();
  for (const name of remaining) {
    const { value } = remaining.next();
    if (value === undefined) {
      throw new Error(`${name} requires a value`);
    }
    if (!VALUE_ARGUMENTS.has(name)) {
      throw new Error(`Unknown quality-area adapter argument: ${name}`);
    }
    values.set(name, value);
  }
  return values;
}

function optionalValue<Value, Fallback>(
  value: string | undefined,
  convert: (text: string) => Value,
  fallback: Fallback,
): Value | Fallback {
  return value === undefined ? fallback : convert(value);
}

function supportedKind(values: ReadonlyMap<string, string>): string {
  const kind = requiredValue(values, '--kind');
  if (!QUALITY_AREA_RUNNERS.has(kind)) {
    throw new Error(`Unsupported quality area: ${kind}`);
  }
  return kind;
}

function snapshotOf(values: ReadonlyMap<string, string>): 'base' | 'head' {
  const snapshot = requiredValue(values, '--snapshot');
  if (snapshot !== 'base' && snapshot !== 'head') {
    throw new Error('--snapshot must be base or head');
  }
  return snapshot;
}

function trustedToolRoot(values: ReadonlyMap<string, string>): string {
  const toolRoot = realpathSync(requiredValue(values, '--tool-root'));
  if (toolRoot !== TRUSTED_TOOL_ROOT) {
    throw new Error('--tool-root must be the project checkout containing this adapter');
  }
  return toolRoot;
}

function movesFileOf(value: string): string {
  const file = realpathSync(path.resolve(value));
  if (!lstatSync(file).isFile()) {
    throw new Error('--baseline-moves-file must be a file');
  }
  return file;
}

function projectPolicyRootOf(values: ReadonlyMap<string, string>, projectRoot: string): string {
  const projectPolicyRoot = optionalValue(
    values.get('--project-policy-root'),
    (value: string) => realpathSync(path.resolve(value)),
    projectRoot,
  );
  if (!lstatSync(projectPolicyRoot).isDirectory()) {
    throw new Error('--project-policy-root must be a directory');
  }
  return projectPolicyRoot;
}

function requiredValue(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}
