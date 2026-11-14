import { wholeCandidates } from '../../../../../../shared/fix/recipes/extract/candidates.mjs';
import { planProject, unitNodeOf } from '../driver/plan-project.mjs';
import { wholeExtraction } from './extraction.mjs';

const STRATEGY = {
  candidatesOf: wholeCandidates,
  inputOf(candidate, found) {
    return {
      units: [candidate.first, candidate.second].map((unit) => unitNodeOf(found, unit)),
      label: candidate.first.name,
      engineHoles: candidate.finding.parameters.length,
    };
  },
  extract: wholeExtraction,
};

export const nearDuplicateExtractRecipe = {
  id: 'typescript-extract-near-duplicate',
  rules: [{ tool: 'structure', rule: 'near-duplicate' }],
  presets: ['typescript', 'javascript'],
  scope: 'project',
  safety: 'safe',
  plan(context) {
    return planProject(context, STRATEGY);
  },
};
