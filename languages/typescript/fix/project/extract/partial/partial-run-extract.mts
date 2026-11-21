import type { ProjectRecipe } from '../../typed/project-types.mts';
import { planProject, unitNodeOf } from '../driver/plan-project.mts';
import type { PartialCandidate, PartialInput, Strategy } from '../typed/extract-types.mts';
import { partialCandidates } from '../../../../../../shared/fix/recipes/extract/candidates.mts';
import { eachSide, lineSpanOf } from '../typed/extract-types.mts';
import { partialExtraction } from './extraction.mts';

const STRATEGY: Strategy<PartialCandidate, PartialInput> = {
  candidatesOf: partialCandidates,
  inputOf(candidate, found) {
    return {
      units: eachSide([candidate.first, candidate.second], (unit) => unitNodeOf(found, unit)),
      runs: eachSide([candidate.runs[0], candidate.runs[1]], lineSpanOf),
      label: candidate.first.name,
      engineHoles: candidate.finding.parameters?.length ?? 0,
    };
  },
  extract: partialExtraction,
};

export const partialRunExtractRecipe: ProjectRecipe = {
  id: 'typescript-extract-partial-run',
  rules: [{ tool: 'structure', rule: 'near-duplicate' }],
  presets: ['typescript', 'javascript'],
  scope: 'project',
  safety: 'review',
  plan(context) {
    return planProject(context, STRATEGY);
  },
};
