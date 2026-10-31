import { fileURLToPath } from 'node:url';
import { createHistoryAnalyzers } from '../../shared/history/analyzers.mjs';
import { createHygieneAnalyzers } from '../../shared/hygiene/analyzers.mjs';
import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mjs';
import { createJavaAnalyzer } from '../../languages/java/adapters/java-analyzer.mjs';
import { createPythonAnalyzers } from '../../languages/python/adapters/python-analyzer.mjs';
import { createGoAnalyzer } from '../../languages/go/adapters/go-analyzer.mjs';
import {
  configuredAnalyzers,
  javascriptAnalyzers,
} from '../../languages/typescript/preset/diff/configured-analyzers.mjs';

const entryPath = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const hygieneAnalyzers = createHygieneAnalyzers(entryPath);
const historyAnalyzers = createHistoryAnalyzers(entryPath);

export function presetAnalyzers(config, injected) {
  return injected ?? [...languageAnalyzers(config), ...hygieneAnalyzers, ...optInAnalyzers(config)];
}

function languageAnalyzers(config) {
  if (config.preset === 'python') {
    return createPythonAnalyzers(config.python);
  }
  if (config.preset === 'go') {
    return [createGoAnalyzer(config.go)];
  }
  if (GRADLE_PRESETS.includes(config.preset)) {
    return [createJavaAnalyzer({ kotlin: config.preset === 'kotlin' })];
  }
  return config.preset === 'javascript' ? javascriptAnalyzers() : configuredAnalyzers();
}

function optInAnalyzers(config) {
  return config.history?.coChange === true ? historyAnalyzers : [];
}
