import { HYGIENE_RULE_IDS } from '../../../project-rules/hygiene-rules.mts';
import { GITIGNORE_PATH, gitignoreEdit, ignoreEntry } from './gitignore-entry.mts';
import { UNTRACK_RULES } from './hygiene-inputs.mts';
import type { UntrackFinding, UntrackFix, UntrackPlanContext } from './typed/hygiene-types.mts';

const TOOL = 'repository-hygiene';
const KEY_STAYS =
  'rotate the key, it stays in the git history, and load the new one from the environment or a secret store';

function targetOf(finding: UntrackFinding): { name: string; directory: boolean } {
  if (finding.rule === HYGIENE_RULE_IDS.committedBuildOutput) {
    return { name: finding.identity.slice(0, finding.identity.lastIndexOf('|')), directory: true };
  }
  return { name: finding.path, directory: false };
}

function fixOf(finding: UntrackFinding, gitignore: string | undefined): UntrackFix {
  const { name, directory } = targetOf(finding);
  const ignore = gitignoreEdit(gitignore, ignoreEntry(name, { directory }));
  return {
    finding: { tool: TOOL, rule: finding.rule, path: finding.path, line: 1 },
    edits: [...(ignore === undefined ? [] : [ignore]), { type: 'untrack', path: name }],
    ...(finding.rule === HYGIENE_RULE_IDS.committedPrivateKey ? { stays: KEY_STAYS } : {}),
  };
}

export const untrackCommittedFilesRecipe = {
  id: 'untrack-committed-files',
  rules: UNTRACK_RULES.map((rule) => ({ tool: TOOL, rule })),
  presets: ['typescript', 'java', 'kotlin', 'python', 'go'],
  scope: 'project',
  safety: 'review',
  accepts: (name: string): boolean => name === GITIGNORE_PATH,
  plan({ read, inputs }: UntrackPlanContext): { fixes: UntrackFix[] } {
    const gitignore = read(GITIGNORE_PATH);
    return { fixes: (inputs.hygiene?.findings ?? []).map((finding) => fixOf(finding, gitignore)) };
  },
};
