import { createJavaAnalyzer } from '../languages/java/adapters/java-analyzer.mjs';
import { createPythonAnalyzer } from '../languages/python/adapters/python-analyzer.mjs';
import { configuredAnalyzers } from '../languages/typescript/preset/diff/configured-analyzers.mjs';

export function presetAnalyzers(config, injected) {
  if (injected !== undefined) {
    return injected;
  }
  if (config.preset === 'python') {
    return [createPythonAnalyzer(config.python)];
  }
  return config.preset === 'java' ? [createJavaAnalyzer()] : configuredAnalyzers;
}
