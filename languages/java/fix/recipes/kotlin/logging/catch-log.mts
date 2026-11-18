import { swallowedCatchBlocks as untypedSwallowedCatchBlocks } from '../../../../adapters/kotlin/scan/rules/catches.mjs';
import { catchLogCalls as untypedCatchLogCalls } from '../../../../source/catch-logging.mjs';
import { isKotlinTestPath, kotlinRecipe } from '../shared/kotlin-recipe.mts';

type LoggerCall = {
  readonly index: number;
  readonly open: number;
  readonly close: number;
  readonly args: readonly string[];
  readonly lambda: { readonly open: number; readonly close: number } | undefined;
};

type CaughtLog = { readonly caught: string; readonly call: LoggerCall };

const swallowedCatchBlocks: (code: string) => Set<number> = untypedSwallowedCatchBlocks;

const catchLogCalls: (
  code: string,
  language: string,
  options: { readonly reportedElsewhere: Set<number> },
) => readonly CaughtLog[] = untypedCatchLogCalls;

const RULE = { tool: 'detekt', rule: 'catch-log-without-exception' };

function endOfText(code: string, from: number): number {
  return code.slice(0, from).trimEnd().length;
}

function insertion(
  code: string,
  call: LoggerCall,
  caught: string,
): { readonly at: number; readonly text: string } | undefined {
  if (code[call.open] === '{') {
    return { at: endOfText(code, call.open), text: `(${caught})` };
  }
  if (call.args.length === 0 || call.lambda !== undefined) {
    return undefined;
  }
  const at = endOfText(code, call.close);
  return { at, text: code[at - 1] === ',' ? ` ${caught},` : `, ${caught}` };
}

export const catchLogRecipe = kotlinRecipe({
  id: 'kotlin-catch-log-without-exception',
  rules: [RULE],
  where: 'both',
  find({ code }, { path }) {
    const reportedElsewhere = isKotlinTestPath(path)
      ? new Set<number>()
      : swallowedCatchBlocks(code);
    return catchLogCalls(code, 'kotlin', { reportedElsewhere }).flatMap(({ caught, call }) => {
      const found = insertion(code, call, caught);
      return found === undefined
        ? []
        : [
            {
              offset: call.index,
              edits: [{ start: found.at, end: found.at, text: found.text }],
            },
          ];
    });
  },
});
