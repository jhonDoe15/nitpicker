import type { ProjectRecipe } from '../../typed/project-types.mts';
import { planProject, unitNodeOf } from '../driver/plan-project.mts';
import type { Candidate, Strategy, WholeInput } from '../typed/extract-types.mts';
import { eachSide } from '../typed/extract-types.mts';
import { wholeCandidates } from '../typed/typed-views.mts';
import { wholeExtraction } from './extraction.mts';

const STRATEGY: Strategy<Candidate, WholeInput> = {
  candidatesOf: wholeCandidates,
  inputOf(candidate, found) {
    return {
      units: eachSide([candidate.first, candidate.second], (unit) => unitNodeOf(found, unit)),
      label: candidate.first.name,
      engineHoles: candidate.finding.parameters.length,
    };
  },
  extract: wholeExtraction,
};

export const nearDuplicateExtractRecipe: ProjectRecipe = {
  id: 'typescript-extract-near-duplicate',
  rules: [{ tool: 'structure', rule: 'near-duplicate' }],
  presets: ['typescript', 'javascript'],
  scope: 'project',
  safety: 'safe',
  plan(context) {
    return planProject(context, STRATEGY);
  },
};
