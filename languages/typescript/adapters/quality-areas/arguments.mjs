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

export function parseArguments(arguments_) {
  const values = new Map();
  const remaining = arguments_.values();
  for (const name of remaining) {
    const { value } = remaining.next();
    if (value === undefined) {
      throw new Error(`${name ?? '<missing>'} requires a value`);
    }
    if (
      ![
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
      ].includes(name)
    ) {
      throw new Error(`Unknown quality-area adapter argument: ${name}`);
    }
    values.set(name, value);
  }
  const kind = requiredValue(values, '--kind');
  if (!QUALITY_AREA_RUNNERS.has(kind)) {
    throw new Error(`Unsupported quality area: ${kind}`);
  }
  const snapshot = requiredValue(values, '--snapshot');
  if (snapshot !== 'base' && snapshot !== 'head') {
    throw new Error('--snapshot must be base or head');
  }
  const toolRoot = realpathSync(requiredValue(values, '--tool-root'));
  if (toolRoot !== TRUSTED_TOOL_ROOT) {
    throw new Error('--tool-root must be the project checkout containing this adapter');
  }
  const projectRoot = validatedSnapshotRoot(
    requiredValue(values, '--project-root'),
    '--project-root',
  );
  const projectPolicyValue = values.get('--project-policy-root');
  const projectPolicyRoot =
    projectPolicyValue === undefined ? projectRoot : realpathSync(path.resolve(projectPolicyValue));
  if (!lstatSync(projectPolicyRoot).isDirectory()) {
    throw new Error('--project-policy-root must be a directory');
  }
  return {
    analyzerName: requiredValue(values, '--analyzer-name'),
    kind,
    projectRoot,
    projectPolicyRoot,
    policyRoot: validatedSnapshotRoot(requiredValue(values, '--policy-root'), '--policy-root'),
    toolRoot,
    liveProjectRoot:
      values.get('--live-project-root') === undefined
        ? PACKAGE_ROOT
        : realpathSync(values.get('--live-project-root')),
    snapshot,
    legacyInventory: values.get('--legacy-inventory') ?? DEFAULT_LEGACY_INVENTORY,
    crapScoreLimit:
      values.get('--crap-score-limit') === undefined
        ? DEFAULT_CRAP_SCORE_LIMIT
        : parsePositiveNumber(values.get('--crap-score-limit'), '--crap-score-limit'),
    baselineRoot:
      values.get('--baseline-root') === undefined
        ? undefined
        : validatedSnapshotRoot(values.get('--baseline-root'), '--baseline-root'),
  };
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
