import { fileURLToPath } from 'node:url';
import {
  type Analyzer,
  type ProfiledAnalyzer,
  analyzersOf,
} from '../../shared/values/analyzers.mts';
import type { NitpickerConfig } from './config-types.mts';
import { configureAnalyzers } from './configure-analyzers.mjs';
import { createHistoryAnalyzers } from '../../shared/history/analyzers.mjs';
import { createHygieneAnalyzers } from '../../shared/hygiene/analyzers.mjs';
import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mjs';
import { createJavaAnalyzer } from '../../languages/java/adapters/java-analyzer.mjs';
import { createPythonAnalyzers } from '../../languages/python/adapters/python-analyzer.mjs';
import { createGoAnalyzers } from '../../languages/go/adapters/go-analyzer.mjs';
import {
  configuredAnalyzers,
  javascriptAnalyzers,
} from '../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { checkoutModuleUrl } from '../../shared/paths/checkout-module.mjs';

export const configureAll: (
  ...request: Parameters<typeof configureAnalyzers>
) => readonly ProfiledAnalyzer[] = configureAnalyzers;

const entryPath = fileURLToPath(checkoutModuleUrl(new URL('../cli.mjs', import.meta.url)));
const hygieneAnalyzers = analyzersOf(createHygieneAnalyzers(entryPath));
const historyAnalyzers = analyzersOf(createHistoryAnalyzers(entryPath));

export function presetAnalyzers(
  config: NitpickerConfig,
  injected?: readonly Analyzer[],
): readonly Analyzer[] {
  if (injected !== undefined) {
    return injected;
  }
  const language = languageAnalyzers(config);
  return [...language, ...hygieneAnalyzers, ...optInAnalyzers(config, language)];
}

function languageAnalyzers(config: NitpickerConfig): Analyzer[] {
  if (config.preset === 'python') {
    return analyzersOf(createPythonAnalyzers(config.python));
  }
  if (config.preset === 'go') {
    return analyzersOf(createGoAnalyzers(config.go));
  }
  if (config.preset !== undefined && GRADLE_PRESETS.includes(config.preset)) {
    return analyzersOf([createJavaAnalyzer({ kotlin: config.preset === 'kotlin' })]);
  }
  return analyzersOf(
    config.preset === 'javascript' ? javascriptAnalyzers() : configuredAnalyzers(),
  );
}

function optInAnalyzers(config: NitpickerConfig, language: readonly Analyzer[]): Analyzer[] {
  const publishers = language
    .filter(({ publishesModuleImports }) => publishesModuleImports === true)
    .map(({ name }) => name);
  return config.history?.coChange === true
    ? historyAnalyzers.map((analyzer) => ({ ...analyzer, colocatedWith: publishers }))
    : [];
}
