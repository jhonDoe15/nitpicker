import { catchLogCalls } from '../../../../source/catch-logging.mjs';
import { swallowedCatchBlocks } from '../../../../adapters/kotlin/scan/rules/catches.mjs';
import { isKotlinTestPath, kotlinRecipe } from '../shared/kotlin-recipe.mjs';

const RULE = { tool: 'detekt', rule: 'catch-log-without-exception' };

function endOfText(code, from) {
  return code.slice(0, from).trimEnd().length;
}

function insertion(code, call, caught) {
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
    const reportedElsewhere = isKotlinTestPath(path) ? new Set() : swallowedCatchBlocks(code);
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
