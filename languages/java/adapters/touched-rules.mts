import { TOUCHED_CODE_RULES } from '../../../shared/policy.mjs';
export function isJavaTouchedRule(
  rule: string,
  finding?: { readonly tool?: string | undefined },
): boolean {
  const tool = finding?.tool;
  return TOUCHED_CODE_RULES.some(
    (entry) => entry.rule === rule && tool !== undefined && entry.tools.includes(tool),
  );
}
