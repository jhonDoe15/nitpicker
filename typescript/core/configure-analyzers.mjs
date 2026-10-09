import { DEFAULT_LEGACY_INVENTORY } from '../shared/legacy-inventory.mjs';
import { JAVA_ANALYZER_NAME } from '../adapters/java/java-analyzer.mjs';
import { configureJavaAnalyzer } from '../adapters/java/java-policy.mjs';
import { addCustomAnalyzers } from '../adapters/diff/custom-analyzer.mjs';
import {
  applyLayout,
  applyLegacyInventory,
  applyThresholds,
} from '../preset/diff/configured-analyzers.mjs';
import { applyDisable } from './config.mjs';

/**
 * Applies the config file to an analyzer list. The comparison, the snapshot and the shard
 * aggregation all use it, so shards and the aggregate agree on the analyzer set and policy hash.
 */
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

/** The shared keys (`thresholds`, `exclude`, `legacyInventory`) reach the Java analyzer here. */
function applyJavaConfig(analyzers, config) {
  return analyzers.map((analyzer) =>
    analyzer.name === JAVA_ANALYZER_NAME
      ? configureJavaAnalyzer(analyzer, {
          thresholds: config.thresholds,
          exclude: config.exclude,
          legacyInventory: config.legacyInventory ?? DEFAULT_LEGACY_INVENTORY,
        })
      : analyzer,
  );
}
