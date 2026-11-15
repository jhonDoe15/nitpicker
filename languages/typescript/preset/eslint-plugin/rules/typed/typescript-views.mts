import type TypeScript from 'typescript';
import { lazyTypeScriptApi as untypedLazyTypeScriptApi } from '../../../../typescript-api/lazy-typescript-api.mjs';

const lazyTypeScriptApi: () => typeof TypeScript = untypedLazyTypeScriptApi;

export const ts = lazyTypeScriptApi();

export function variableNames(statement: TypeScript.VariableStatement): string[] {
  return statement.declarationList.declarations
    .map(({ name }) => name)
    .filter(ts.isIdentifier)
    .map(({ text }) => text);
}
