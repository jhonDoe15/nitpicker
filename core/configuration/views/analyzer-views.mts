import {
  analyzersOf,
  type Analyzer,
  type ProfiledAnalyzer,
} from '../../../shared/values/analyzers.mts';
import { callUntyped } from '../../../languages/java/adapters/typed/java-values.mts';
import { textsOf } from '../../../shared/values/readers.mts';
import { applyAnalyzerTimeouts as untypedApplyAnalyzerTimeouts } from '../../../shared/analyzer-timeouts/analyzer-timeouts.mjs';
import { configureJavaAnalyzer as untypedConfigureJavaAnalyzer } from '../../../languages/java/adapters/java-policy.mts';
import { kotlinStyleFiles as untypedKotlinStyleFiles } from '../../../languages/java/adapters/kotlin/kotlin-tools.mts';
import {
  mutationConfigFiles as untypedMutationConfigFiles,
  pythonConfigFiles as untypedPythonConfigFiles,
} from '../../../languages/python/adapters/project-tools/config-files.mts';
import { formatterChoiceFiles as untypedFormatterChoiceFiles } from '../../../languages/go/adapters/formatting/go-formatters.mts';
import {
  applyLayout as untypedApplyLayout,
  applyLegacyInventory as untypedApplyLegacyInventory,
  applyTestRunner as untypedApplyTestRunner,
  applyThresholds as untypedApplyThresholds,
} from '../../../languages/typescript/preset/diff/configured-analyzers.mjs';

export type StyleFiles = (policyRoot: string) => readonly string[];

export const applyAnalyzerTimeouts: (
  analyzers: readonly ProfiledAnalyzer[],
  timeouts: unknown,
  knownNames: readonly string[],
) => ProfiledAnalyzer[] = untypedApplyAnalyzerTimeouts;

export function configureJavaAnalyzer(analyzer: Analyzer, options: object): Analyzer {
  const [configured] = analyzersOf([callUntyped(untypedConfigureJavaAnalyzer, analyzer, options)]);
  return configured ?? analyzer;
}

export function kotlinStyleFiles(
  config: { readonly tools?: object; readonly kotlin?: object },
  policyRoot: string,
): string[] {
  return textsOf(callUntyped(untypedKotlinStyleFiles, config, policyRoot));
}

export const mutationConfigFiles: StyleFiles = untypedMutationConfigFiles;

export const pythonConfigFiles: StyleFiles = untypedPythonConfigFiles;

export const formatterChoiceFiles: StyleFiles = untypedFormatterChoiceFiles;

export const applyLayout: (
  analyzers: readonly Analyzer[],
  headPolicy: object | undefined,
) => Analyzer[] = untypedApplyLayout;

export const applyTestRunner: (
  analyzers: readonly Analyzer[],
  headPolicy: object | undefined,
) => Analyzer[] = untypedApplyTestRunner;

export const applyThresholds: (
  analyzers: readonly Analyzer[],
  thresholds: object | undefined,
  headPolicy: object | undefined,
) => Analyzer[] = untypedApplyThresholds;

export const applyLegacyInventory: (
  analyzers: readonly Analyzer[],
  legacyInventory: string | undefined,
) => ProfiledAnalyzer[] = untypedApplyLegacyInventory;
