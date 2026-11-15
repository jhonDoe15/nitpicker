import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { bodyOf, type UnitNode } from './typed/extract-types.mts';
import { descendants, isWritten, symbolAt } from './syntax.mts';

const ts = typescriptApi();

export function writesOf(
  unit: UnitNode,
  checker: TypeScript.TypeChecker,
): { node: TypeScript.Node; symbol: TypeScript.Symbol | undefined }[] {
  return descendants(bodyOf(unit))
    .filter((node) => ts.isIdentifier(node) && isWritten(node))
    .map((node) => ({ node, symbol: symbolAt(node, checker) }))
    .filter(({ symbol }) => symbol !== undefined);
}
