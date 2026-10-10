import { createJavaAnalyzer } from '../languages/java/adapters/java-analyzer.mjs';
import { configuredAnalyzers } from '../languages/typescript/preset/diff/configured-analyzers.mjs';

export function presetAnalyzers(config, injected) {
  if (injected !== undefined) {
    return injected;
  }
  return config.preset === 'java' ? [createJavaAnalyzer()] : configuredAnalyzers;
}
