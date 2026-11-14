import { ts } from '../../../typescript-api/typescript-api.mjs';
import { descendants, isWritten, symbolAt } from './syntax.mjs';

export function writesOf(unit, checker) {
  return descendants(unit.body)
    .filter((node) => ts.isIdentifier(node) && isWritten(node))
    .map((node) => ({ node, symbol: symbolAt(node, checker) }))
    .filter(({ symbol }) => symbol !== undefined);
}
