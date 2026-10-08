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
      applyThresholds(
        applyLayout(applyDisable(analyzers, config), headPolicy),
        config.thresholds,
        headPolicy,
      ),
      config.analyzers,
    ),
    config.legacyInventory,
  );
}
