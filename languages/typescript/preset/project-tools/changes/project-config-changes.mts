import type {
  AppliedValues,
  FileChange,
} from '../../../../../core/policy-changes/types/policy-types.mts';
import type { ProjectEvaluation, ToolPolicy } from '../typed/tool-types.mts';
import { evaluatedProjectConfig } from '../project-tool-policy.mts';
import { DEPENDENCY_CRUISER_TOOL, KNIP_TOOL } from '../project-config-files.mts';
import { dependencyCruiserConfigChanges } from './dependency-cruiser-config-changes.mts';
import { knipConfigChanges } from './knip-config-changes.mts';

const CLASSIFIERS = new Map<string, (applied: AppliedValues) => FileChange[]>([
  [KNIP_TOOL, knipConfigChanges],
  [DEPENDENCY_CRUISER_TOOL, dependencyCruiserConfigChanges],
]);

function evaluatedSide(tool: string, root: string, optedIn: boolean): ProjectEvaluation {
  if (!optedIn) {
    return { kind: 'config', config: {}, files: [] };
  }
  const evaluated = evaluatedProjectConfig(tool, root);
  return evaluated.kind === 'missing' ? { kind: 'config', config: {}, files: [] } : evaluated;
}

export function appliedProjectConfigs(
  tool: string,
  {
    base,
    head,
    baseOptedIn,
  }: {
    readonly base: { readonly root: string };
    readonly head: { readonly root: string; readonly config: ToolPolicy };
    readonly baseOptedIn: boolean;
  },
): { applied?: AppliedValues } {
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
      precedence: head.config.tools?.[tool]?.precedence,
      label: `${tool} ${files.join(' and ')}`,
      files,
    },
  };
}

export function hasProjectConfigChanges(tool: string): boolean {
  return CLASSIFIERS.has(tool);
}

export function projectConfigChanges(tool: string, applied: AppliedValues): FileChange[] {
  return CLASSIFIERS.get(tool)?.(applied) ?? [];
}
