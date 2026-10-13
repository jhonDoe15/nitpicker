import { DEFAULT_LEGACY_INVENTORY } from '../shared/legacy-inventory.mjs';
import { GRADLE_PRESETS } from '../languages/java/adapters/gradle-presets.mjs';
import {
  MUTATION_ANALYZER_NAME,
  PYTHON_ANALYZER_NAME,
} from '../languages/python/adapters/python-analyzer.mjs';
import { configureJavaAnalyzer } from '../languages/java/adapters/java-policy.mjs';
import { addCustomAnalyzers } from './custom-analyzer.mjs';
import {
  applyLayout,
  applyLegacyInventory,
  applyThresholds,
} from '../languages/typescript/preset/diff/configured-analyzers.mjs';
import { applyDisable } from './config.mjs';

export function configureAnalyzers(analyzers, config, headPolicy) {
  return applyLegacyInventory(
    addCustomAnalyzers(
      applyJavaConfig(
        applyThresholds(
          applyLayout(applyDisable(analyzers, config), headPolicy),
          config.thresholds,
          headPolicy,
        ),
        config,
      ),
      config.analyzers,
    ),
    config.legacyInventory,
  );
}

function applyJavaConfig(analyzers, config) {
  const names = [
    ...GRADLE_PRESETS,
    PYTHON_ANALYZER_NAME,
    ...(config.preset === 'python' ? [MUTATION_ANALYZER_NAME] : []),
  ];
  return analyzers.map((analyzer) =>
    names.includes(analyzer.name)
      ? configureJavaAnalyzer(analyzer, {
          kotlin: config.kotlin,
          thresholds: config.thresholds,
          exclude: config.exclude,
          legacyInventory: config.legacyInventory ?? DEFAULT_LEGACY_INVENTORY,
        })
      : analyzer,
  );
}
