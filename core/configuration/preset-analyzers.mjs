import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mjs';
import { createJavaAnalyzer } from '../../languages/java/adapters/java-analyzer.mjs';
import { createPythonAnalyzers } from '../../languages/python/adapters/python-analyzer.mjs';
import {
  configuredAnalyzers,
  javascriptAnalyzers,
} from '../../languages/typescript/preset/diff/configured-analyzers.mjs';

export function presetAnalyzers(config, injected) {
  if (injected !== undefined) {
    return injected;
  }
  if (config.preset === 'python') {
    return createPythonAnalyzers(config.python);
  }
  if (GRADLE_PRESETS.includes(config.preset)) {
    return [createJavaAnalyzer({ kotlin: config.preset === 'kotlin' })];
  }
  return config.preset === 'javascript' ? javascriptAnalyzers() : configuredAnalyzers();
}
