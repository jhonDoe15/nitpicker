import { createHash } from 'node:crypto';
import { configError } from '../../shared/config.mjs';
import { DEFAULT_LEGACY_INVENTORY } from '../../shared/legacy-inventory.mjs';
import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mjs';
import {
  MUTATION_ANALYZER_NAME,
  PYTHON_ANALYZER_NAME,
} from '../../languages/python/adapters/python-analyzer.mjs';
import { applyDisable } from './config.mts';
import { GO_ANALYZER_NAME } from '../../languages/go/adapters/go-analyzer.mjs';
import {
  applyAnalyzerTimeouts,
  applyLayout,
  applyLegacyInventory,
  applyTestRunner,
  applyThresholds,
  configureJavaAnalyzer,
  formatterChoiceFiles,
  kotlinStyleFiles,
  mutationConfigFiles,
  pythonConfigFiles,
  type StyleFiles,
} from './views/analyzer-views.mts';
import { fieldOf, objectOf, textOf } from '../../shared/values/readers.mts';
import type { Analyzer, ProfiledAnalyzer } from '../../shared/values/analyzers.mts';
import type { CustomAnalyzerEntry, NitpickerConfig } from '../../shared/values/config-types.mts';

export function configureAnalyzers(
  analyzers: readonly Analyzer[],
  config: NitpickerConfig,
  headPolicy: unknown,
): ProfiledAnalyzer[] {
  return applyAnalyzerTimeouts(
    configuredWithoutTimeouts(analyzers, config, objectOf(headPolicy)),
    config.analyzerTimeoutMinutes,
    [...analyzers, ...(config.analyzers ?? [])].map(({ name }) => name),
  );
}

function configuredWithoutTimeouts(
  analyzers: readonly Analyzer[],
  config: NitpickerConfig,
  headPolicy: object | undefined,
): ProfiledAnalyzer[] {
  return applyLegacyInventory(
    addCustomAnalyzers(
      applyJavaConfig(
        applyTestRunner(
          applyThresholds(
            applyLayout(applyDisable(analyzers, config), headPolicy),
            config.thresholds,
            headPolicy,
          ),
          headPolicy,
        ),
        config,
      ),
      config.analyzers,
    ),
    config.legacyInventory,
  );
}

function styleFilesOf(config: NitpickerConfig, analyzerName: string): StyleFiles | undefined {
  if (config.preset === 'kotlin') {
    return (policyRoot: string) => kotlinStyleFiles(config, policyRoot);
  }
  if (config.preset === 'go') {
    return formatterChoiceFiles;
  }
  if (config.preset !== 'python') {
    return undefined;
  }
  return analyzerName === PYTHON_ANALYZER_NAME ? pythonConfigFiles : mutationConfigFiles;
}

function applyJavaConfig(analyzers: readonly Analyzer[], config: NitpickerConfig): Analyzer[] {
  const names = [
    ...GRADLE_PRESETS,
    PYTHON_ANALYZER_NAME,
    GO_ANALYZER_NAME,
    ...(config.preset !== undefined && ['python', 'go'].includes(config.preset)
      ? [MUTATION_ANALYZER_NAME]
      : []),
  ];
  return analyzers.map((analyzer) =>
    names.includes(analyzer.name)
      ? configureJavaAnalyzer(analyzer, {
          kotlin: config.kotlin,
          java: config.java,
          mutationOff: (config.disable ?? []).includes('mutation'),
          tools: config.tools,
          testConsole: config.testConsole,
          styleFiles: styleFilesOf(config, analyzer.name),
          exclude: config.exclude,
          legacyInventory: config.legacyInventory ?? DEFAULT_LEGACY_INVENTORY,
          ...(analyzer.name === MUTATION_ANALYZER_NAME
            ? {
                thresholds: { crapLimit: config.thresholds?.['crapLimit'] },
                exceptions: config.exceptions,
              }
            : {
                thresholds: config.thresholds,
                exceptions: config.exceptions,
                duplicates: config.duplicates,
              }),
        })
      : analyzer,
  );
}

function createCustomAnalyzer({
  name,
  command = '',
  args = [],
}: CustomAnalyzerEntry): Analyzer & ProfiledAnalyzer {
  return {
    name,
    version: 'custom',
    custom: true,
    configurationHash: createHash('sha256')
      .update(JSON.stringify({ name, command, args }))
      .digest('hex'),
    exclusions: [],
    createInvocation(context: unknown) {
      const projectRoot = textOf(fieldOf(context, 'projectRoot'));
      const snapshot = fieldOf(context, 'snapshot');
      return {
        command,
        args,
        cwd: projectRoot,
        env: {
          ...process.env,
          NITPICKER_ANALYZER: name,
          NITPICKER_PROJECT_ROOT: projectRoot,
          ...(snapshot === undefined ? {} : { NITPICKER_SNAPSHOT: textOf(snapshot) }),
        },
      };
    },
  };
}

function addCustomAnalyzers(
  analyzers: readonly Analyzer[],
  entries: readonly CustomAnalyzerEntry[] = [],
): Analyzer[] {
  const taken = new Set(analyzers.map(({ name }) => name));
  const custom = entries.map((entry) => {
    if (taken.has(entry.name)) {
      throw configError(`analyzers entry "${entry.name}" clashes with another analyzer name`);
    }
    taken.add(entry.name);
    return createCustomAnalyzer(entry);
  });
  return [...analyzers, ...custom];
}
