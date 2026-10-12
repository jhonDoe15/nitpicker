import { GRADLE_PRESETS } from '../languages/java/adapters/gradle-presets.mjs';
import { createJavaAnalyzer } from '../languages/java/adapters/java-analyzer.mjs';
import { configuredAnalyzers } from '../languages/typescript/preset/diff/configured-analyzers.mjs';

export function presetAnalyzers(config, injected) {
  if (injected !== undefined) {
    return injected;
  }
  if (GRADLE_PRESETS.includes(config.preset)) {
    return [createJavaAnalyzer({ kotlin: config.preset === 'kotlin' })];
  }
  return configuredAnalyzers;
}
