import { createJavaAnalyzer } from '../adapters/java/java-analyzer.mjs';
import { configuredAnalyzers } from '../preset/diff/configured-analyzers.mjs';

/**
 * The analyzers of the preset the config selects. `preset` is explicit: there is no auto-detection
 * of a Gradle project. Injected analyzers (tests, embedding) win over the preset.
 */
export function presetAnalyzers(config, injected) {
  if (injected !== undefined) {
    return injected;
  }
  return config.preset === 'java' ? [createJavaAnalyzer()] : configuredAnalyzers;
}
