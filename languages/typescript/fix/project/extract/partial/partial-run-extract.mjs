import { partialCandidates } from '../../../../../../shared/fix/recipes/extract/candidates.mjs';
import { planProject, unitNodeOf } from '../driver/plan-project.mjs';
import { partialExtraction } from './extraction.mjs';

const STRATEGY = {
  candidatesOf: partialCandidates,
  inputOf(candidate, found) {
    return {
      units: [candidate.first, candidate.second].map((unit) => unitNodeOf(found, unit)),
      runs: candidate.runs,
      label: candidate.first.name,
      engineHoles: candidate.finding.parameters.length,
    };
  },
  extract: partialExtraction,
};

export const partialRunExtractRecipe = {
  id: 'typescript-extract-partial-run',
  rules: [{ tool: 'structure', rule: 'near-duplicate' }],
  presets: ['typescript', 'javascript'],
  scope: 'project',
  safety: 'review',
  plan(context) {
    return planProject(context, STRATEGY);
  },
};
