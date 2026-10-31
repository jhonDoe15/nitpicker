import { evaluatedProjectConfig } from '../project-tool-policy.mjs';
import { DEPENDENCY_CRUISER_TOOL, KNIP_TOOL } from '../project-config-files.mjs';
import { dependencyCruiserConfigChanges } from './dependency-cruiser-config-changes.mjs';
import { knipConfigChanges } from './knip-config-changes.mjs';

const CLASSIFIERS = new Map([
  [KNIP_TOOL, knipConfigChanges],
  [DEPENDENCY_CRUISER_TOOL, dependencyCruiserConfigChanges],
]);

function evaluatedSide(tool, root, optedIn) {
  if (!optedIn) {
    return { kind: 'config', config: {}, files: [] };
  }
  const evaluated = evaluatedProjectConfig(tool, root);
  return evaluated.kind === 'missing' ? { kind: 'config', config: {}, files: [] } : evaluated;
}

export function appliedProjectConfigs(tool, { base, head, baseOptedIn }) {
  const before = evaluatedSide(tool, base.root, baseOptedIn);
  const after = evaluatedSide(tool, head.root, true);
  if (before.kind !== 'config' || after.kind !== 'config') {
    return {};
  }
  const files = after.files.length > 0 ? after.files : before.files;
  return {
    applied: {
      base: before.config,
      head: after.config,
      precedence: head.config.tools[tool].precedence,
      label: `${tool} ${files.join(' and ')}`,
      files,
    },
  };
}

export function hasProjectConfigChanges(tool) {
  return CLASSIFIERS.has(tool);
}

export function projectConfigChanges(tool, applied) {
  return CLASSIFIERS.get(tool)(applied);
}
