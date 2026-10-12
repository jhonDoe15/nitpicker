import { detectCodeShortcuts } from './code-shortcuts.mjs';
import { detectGateTampering } from './gate-tampering.mjs';
import { detectLegacyRewrite } from './legacy-rewrite.mjs';
import { detectWeakenedTests } from './weakened-tests.mjs';
import { loadTree, toTree } from './tree.mjs';

export { detectCodeShortcuts } from './code-shortcuts.mjs';
export { detectGateTampering } from './gate-tampering.mjs';
export { detectLegacyRewrite } from './legacy-rewrite.mjs';
export { detectWeakenedTests } from './weakened-tests.mjs';
export { diffTrees, loadTree, toTree } from './tree.mjs';

/**
 * Runs every shortcut detector. Give either trees (`fixture`, `final`) or directories
 * (`fixtureDir`, `finalDir`), plus optionally `agentReport`, `referenceReport` and
 * `expectedPolicyHash` (see gate-tampering.mjs), `featuresRoot` (see code-shortcuts.mjs) and
 * `reference`, the tree of the case's reference solution (see legacy-rewrite.mjs).
 * Returns a flat list of `{ category, kind, path?, line?, detail, ... }`.
 */
export function detectShortcuts(inputs) {
  const fixture = toTree(inputs.fixture ?? loadTree(inputs.fixtureDir));
  const final = toTree(inputs.final ?? loadTree(inputs.finalDir));
  const shared = { ...inputs, fixture, final };
  return [
    ...detectGateTampering(shared),
    ...detectWeakenedTests(shared),
    ...detectCodeShortcuts(shared),
    ...detectLegacyRewrite(shared),
  ];
}

export function groupByCategory(shortcuts) {
  const groups = {};
  for (const shortcut of shortcuts) {
    (groups[shortcut.category] ??= []).push(shortcut);
  }
  return groups;
}
