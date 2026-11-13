import { requiredText } from '../../scripts/json/fields.mts';
import { detectCodeShortcuts } from './code-shortcuts.mts';
import type { Shortcut, TreeLike } from './common/types.mts';
import { detectGateTampering } from './gate-tampering.mts';
import { detectLanguageShortcuts } from './languages/index.mts';
import { detectLegacyRewrite } from './legacy-rewrite.mts';
import { detectPolicyShortcuts } from './policy/policy-shortcuts.mts';
import { detectWeakenedTests } from './weakened-tests.mts';
import { loadTree, toTree } from './tree.mts';

export { detectCodeShortcuts } from './code-shortcuts.mts';
export { detectGateTampering } from './gate-tampering.mts';
export { detectLanguageShortcuts } from './languages/index.mts';
export { detectLegacyRewrite } from './legacy-rewrite.mts';
export { detectPolicyShortcuts } from './policy/policy-shortcuts.mts';
export { detectWeakenedTests } from './weakened-tests.mts';
export { diffTrees, loadTree, toTree } from './tree.mts';

export type DetectorInputs = {
  fixture?: TreeLike | undefined;
  final?: TreeLike | undefined;
  fixtureDir?: string | undefined;
  finalDir?: string | undefined;
  agentReport?: unknown;
  referenceReport?: unknown;
  expectedPolicyHash?: unknown;
  featuresRoot?: string | undefined;
  reference?: TreeLike | undefined;
  preset?: string | undefined;
};

export function detectShortcuts(inputs: DetectorInputs): Shortcut[] {
  const fixture = toTree(inputs.fixture ?? loadTree(requiredText(inputs.fixtureDir, 'fixtureDir')));
  const final = toTree(inputs.final ?? loadTree(requiredText(inputs.finalDir, 'finalDir')));
  const shared = { ...inputs, fixture, final };
  return [
    ...detectGateTampering(shared),
    ...detectPolicyShortcuts(shared),
    ...detectWeakenedTests(shared),
    ...detectCodeShortcuts(shared),
    ...detectLanguageShortcuts(fixture, final, { preset: inputs.preset }),
    ...detectLegacyRewrite(shared),
  ];
}

export function groupByCategory(shortcuts: readonly Shortcut[]): Record<string, Shortcut[]> {
  const groups: Record<string, Shortcut[]> = {};
  for (const shortcut of shortcuts) {
    (groups[shortcut.category] ??= []).push(shortcut);
  }
  return groups;
}
