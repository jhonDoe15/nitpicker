import { importClosure as untypedImportClosure } from '../../../../../shared/import-closure.mjs';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../../shared/paths/checkout-module.mjs';
import { transpiled as untypedTranspiled } from '../../../../../scripts/typescript/emit.mjs';
import { parseAnalyzerReport as untypedParseAnalyzerReport } from '../../../../../core/diff/comparison/finding-schema.mjs';
import { resolveAnalyzerVersion as untypedResolveAnalyzerVersion } from '../../../preset/analyzer-versions.mjs';
import { hashFiles as untypedHashFiles } from '../../../preset/checks/hash.mjs';
import { configuredAnalyzers as untypedConfiguredAnalyzers } from '../../../preset/diff/configured-analyzers.mjs';
import { accumulatingSpreadMessages as untypedSpreadMessages } from '../../../preset/eslint-plugin/rules/collections/accumulating-spread-messages.mts';
import type { AnalyzerReport } from '../../../../../shared/values/findings.mts';

export function called(untyped: unknown, values: readonly unknown[]): unknown {
  if (typeof untyped !== 'function') {
    throw new TypeError('The called module member is not a function');
  }
  const result: unknown = Reflect.apply(untyped, undefined, values);
  return result;
}

export const importClosure: (
  relativePaths: readonly string[],
  root: string,
) => Map<string, string> = untypedImportClosure;

export const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;

export const transpiled: (text: string, fileName: string, typescript: unknown) => string =
  untypedTranspiled;

export const parseAnalyzerReport: (value: unknown, analyzerName: string) => AnalyzerReport =
  untypedParseAnalyzerReport;

export const resolveAnalyzerVersion: (analyzerName: string, liveProjectRoot: string) => string =
  untypedResolveAnalyzerVersion;

export const hashFiles: (
  relativePaths: readonly string[],
  configurationValues: unknown[],
  options: { readonly root: string },
) => string = untypedHashFiles;

export const configuredAnalyzers: () => readonly {
  readonly name: string;
  readonly cacheKeyFiles: readonly string[];
}[] = untypedConfiguredAnalyzers;

export const accumulatingSpreadMessages: {
  readonly domainReduceObject: string;
  readonly reduceArray: string;
  readonly loopArray: string;
} = untypedSpreadMessages;
