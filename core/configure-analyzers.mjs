import { DEFAULT_LEGACY_INVENTORY } from '../shared/legacy-inventory.mjs';
import { GRADLE_ANALYZER_NAMES } from '../languages/java/adapters/java-analyzer.mjs';
import { PYTHON_ANALYZER_NAME } from '../languages/python/adapters/python-analyzer.mjs';
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
  return analyzers.map((analyzer) =>
    [...GRADLE_ANALYZER_NAMES, PYTHON_ANALYZER_NAME].includes(analyzer.name)
      ? configureJavaAnalyzer(analyzer, {
          kotlin: config.kotlin,
          thresholds: config.thresholds,
          exclude: config.exclude,
          legacyInventory: config.legacyInventory ?? DEFAULT_LEGACY_INVENTORY,
        })
      : analyzer,
  );
}
