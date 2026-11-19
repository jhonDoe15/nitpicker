import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import type { KotlinFound, ScannedKotlin } from '../shared/kotlin-scan.mts';
import { inheritsUnknownMembers, standsAlone } from './call-context.mts';
import { shadowsStandardCalls } from './precondition-calls.mts';

const DEFAULT_MESSAGES: Readonly<Record<string, string>> = {
  require: 'Failed requirement.',
  check: 'Check failed.',
};
const TRAILING_LAMBDA = /^\s*\{/u;

const NOT_NULL =
  /(?<![\w.])(require|check)\s*\(\s*([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*)\s*!=\s*null\s*\)/gu;

function notNullChecks(
  call: string,
  rule: string,
): (scanned: ScannedKotlin) => readonly KotlinFound[] {
  return ({ code }) =>
    shadowsStandardCalls(code)
      ? []
      : [...code.matchAll(NOT_NULL)]
          .filter(({ 1: name }) => name === call)
          .filter(({ index, 0: text }) => standsAlone(code, index, index + text.length))
          .filter(({ index }) => !inheritsUnknownMembers(code, index))
          .map(({ index, 0: text, 2: target }) => {
            const end = index + text.length;
            const message = TRAILING_LAMBDA.test(code.slice(end))
              ? ''
              : ` { "${DEFAULT_MESSAGES[call] ?? ''}" }`;
            const subject = (target ?? '').replaceAll(/\s+/gu, '');
            return {
              rule,
              offset: index,
              edits: [{ start: index, end, text: `${call}NotNull(${subject})${message}` }],
            };
          });
}

export const useRequireNotNullRecipe = kotlinRecipe({
  id: 'kotlin-use-require-not-null',
  rules: [{ tool: 'detekt', rule: 'detekt.style.UseRequireNotNull' }],
  find: notNullChecks('require', 'detekt.style.UseRequireNotNull'),
});

export const useCheckNotNullRecipe = kotlinRecipe({
  id: 'kotlin-use-check-not-null',
  rules: [{ tool: 'detekt', rule: 'detekt.style.UseCheckNotNull' }],
  find: notNullChecks('check', 'detekt.style.UseCheckNotNull'),
});
