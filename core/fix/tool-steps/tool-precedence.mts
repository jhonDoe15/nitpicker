import type { Precedence, Tools } from '../typed/fix-types.mts';

export function toolPrecedenceOf(tools: Tools = {}): Precedence {
  return Object.fromEntries(
    Object.entries(tools).map(([tool, settings]) => [tool, settings.precedence]),
  );
}
