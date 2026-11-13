const NO_THROW_GROWTH_FORM =
  'Edit an existing throw line in place to throw a reason a new helper returns, or return a union from a new helper function.';

type GrowthAdvice = { readonly growthAdvice: string; readonly growthAllowedForm: string };

const GROWTH_ADVICE = new Map<string, GrowthAdvice>([
  [
    'nitpicker/no-throw',
    {
      growthAdvice: `${NO_THROW_GROWTH_FORM} This function had {base} of these at base and the count may not grow: a throw on a new line counts as new even when the count holds.`,
      growthAllowedForm: NO_THROW_GROWTH_FORM,
    },
  ],
]);

/** The ratchet fields that tell a count rule what to do when its count grows; undefined for other rules. */
export function growthAdviceFor(ruleId: string): GrowthAdvice | undefined {
  return GROWTH_ADVICE.get(ruleId);
}
