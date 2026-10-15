import { QUALITY_AREA_RUNNERS } from './registry.mjs';
import { realpathSync, lstatSync } from 'node:fs';
import { TRUSTED_TOOL_ROOT } from './tooling.mjs';
import path from 'node:path';
import {
  PACKAGE_ROOT,
  SNAPSHOT_DIRECTORY_NAMES,
} from '../../../../core/tooling/tool-resolution.mjs';
import { DEFAULT_LEGACY_INVENTORY } from '../../preset/coding-standards/inventory-path.mjs';
import { DEFAULT_CRAP_SCORE_LIMIT } from '../../../../shared/policy.mjs';
import { parsePositiveNumber } from '../../preset/checks/numbers.mjs';
import { tmpdir } from 'node:os';

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
  '--crap-score-limit',
  '--legacy-inventory',
]);

export function parseArguments(arguments_) {
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
    liveProjectRoot: optionalValue(values.get('--live-project-root'), realpathSync, PACKAGE_ROOT),
    snapshot,
    legacyInventory: values.get('--legacy-inventory') ?? DEFAULT_LEGACY_INVENTORY,
    crapScoreLimit: optionalValue(
      values.get('--crap-score-limit'),
      (value) => parsePositiveNumber(value, '--crap-score-limit'),
      DEFAULT_CRAP_SCORE_LIMIT,
    ),
    baselineRoot: optionalValue(
      values.get('--baseline-root'),
      (value) => validatedSnapshotRoot(value, '--baseline-root'),
      undefined,
    ),
  };
}

function collectArguments(arguments_) {
  const values = new Map();
  const remaining = arguments_.values();
  for (const name of remaining) {
    const { value } = remaining.next();
    if (value === undefined) {
      throw new Error(`${name ?? '<missing>'} requires a value`);
    }
    if (!VALUE_ARGUMENTS.has(name)) {
      throw new Error(`Unknown quality-area adapter argument: ${name}`);
    }
    values.set(name, value);
  }
  return values;
}

function optionalValue(value, convert, fallback) {
  return value === undefined ? fallback : convert(value);
}

function supportedKind(values) {
  const kind = requiredValue(values, '--kind');
  if (!QUALITY_AREA_RUNNERS.has(kind)) {
    throw new Error(`Unsupported quality area: ${kind}`);
  }
  return kind;
}

function snapshotOf(values) {
  const snapshot = requiredValue(values, '--snapshot');
  if (snapshot !== 'base' && snapshot !== 'head') {
    throw new Error('--snapshot must be base or head');
  }
  return snapshot;
}

function trustedToolRoot(values) {
  const toolRoot = realpathSync(requiredValue(values, '--tool-root'));
  if (toolRoot !== TRUSTED_TOOL_ROOT) {
    throw new Error('--tool-root must be the project checkout containing this adapter');
  }
  return toolRoot;
}

function projectPolicyRootOf(values, projectRoot) {
  const projectPolicyRoot = optionalValue(
    values.get('--project-policy-root'),
    (value) => realpathSync(path.resolve(value)),
    projectRoot,
  );
  if (!lstatSync(projectPolicyRoot).isDirectory()) {
    throw new Error('--project-policy-root must be a directory');
  }
  return projectPolicyRoot;
}

function validatedSnapshotRoot(value, name) {
  const root = realpathSync(path.resolve(value));
  if (!lstatSync(root).isDirectory()) {
    throw new Error(`${name} must be a directory`);
  }
  if (root === TRUSTED_TOOL_ROOT) {
    return root;
  }
  const relativeToTemporaryRoot = path.relative(realpathSync(tmpdir()), root);
  const segments = relativeToTemporaryRoot.split(path.sep);
  if (
    relativeToTemporaryRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToTemporaryRoot) ||
    segments.length < 2 ||
    !segments[0].startsWith('nitpicker-diff-') ||
    !SNAPSHOT_DIRECTORY_NAMES.includes(segments[1])
  ) {
    throw new Error(`${name} must be inside a generated quality-diff worktree`);
  }
  return root;
}

function requiredValue(values, name) {
  const value = values.get(name);
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}
