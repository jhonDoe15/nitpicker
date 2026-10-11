import { createJavaAnalyzer } from '../languages/java/adapters/java-analyzer.mjs';
import {
  configuredAnalyzers,
  javascriptAnalyzers,
} from '../languages/typescript/preset/diff/configured-analyzers.mjs';

export function presetAnalyzers(config, injected) {
  if (injected !== undefined) {
    return injected;
  }
  if (config.preset === 'java') {
    return [createJavaAnalyzer()];
  }
  return config.preset === 'javascript' ? javascriptAnalyzers : configuredAnalyzers;
}
