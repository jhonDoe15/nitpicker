import { createJavaAnalyzer } from '../languages/java/adapters/java-analyzer.mjs';
import { createPythonAnalyzer } from '../languages/python/adapters/python-analyzer.mjs';
import {
  configuredAnalyzers,
  javascriptAnalyzers,
} from '../languages/typescript/preset/diff/configured-analyzers.mjs';

export function presetAnalyzers(config, injected) {
  if (injected !== undefined) {
    return injected;
  }
  if (config.preset === 'python') {
    return [createPythonAnalyzer(config.python)];
  }
  if (config.preset === 'java') {
    return [createJavaAnalyzer()];
  }
  return config.preset === 'javascript' ? javascriptAnalyzers : configuredAnalyzers;
}
