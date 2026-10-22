import { DESIGN_RULES } from '../../project-rules/design-rules.mjs';

export const DESIGN_EVALUATORS = Object.fromEntries(DESIGN_RULES.map((rule) => [rule, () => []]));
