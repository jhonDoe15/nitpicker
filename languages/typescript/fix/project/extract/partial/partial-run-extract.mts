import type { ProjectRecipe } from '../../typed/project-types.mts';
import { planProject, unitNodeOf } from '../driver/plan-project.mts';
import type { PartialCandidate, PartialInput, Strategy } from '../typed/extract-types.mts';
import { eachSide } from '../typed/extract-types.mts';
import { partialCandidates } from '../typed/typed-views.mts';
import { partialExtraction } from './extraction.mts';

const STRATEGY: Strategy<PartialCandidate, PartialInput> = {
  candidatesOf: partialCandidates,
  inputOf(candidate, found) {
    return {
      units: eachSide([candidate.first, candidate.second], (unit) => unitNodeOf(found, unit)),
      runs: candidate.runs,
      label: candidate.first.name,
      engineHoles: candidate.finding.parameters.length,
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
