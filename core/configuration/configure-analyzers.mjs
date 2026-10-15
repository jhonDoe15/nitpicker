import { createHash } from 'node:crypto';
import { DEFAULT_LEGACY_INVENTORY } from '../../shared/legacy-inventory.mjs';
import { GRADLE_PRESETS } from '../../languages/java/adapters/gradle-presets.mjs';
import {
  MUTATION_ANALYZER_NAME,
  PYTHON_ANALYZER_NAME,
} from '../../languages/python/adapters/python-analyzer.mjs';
import { configureJavaAnalyzer } from '../../languages/java/adapters/java-policy.mjs';
import {
  applyLayout,
  applyLegacyInventory,
  applyThresholds,
} from '../../languages/typescript/preset/diff/configured-analyzers.mjs';
import { applyDisable } from './config.mjs';

export function configureAnalyzers(analyzers, config, headPolicy) {
  return applyLegacyInventory(
    addCustomAnalyzers(
      applyJavaConfig(
        applyThresholds(
          applyLayout(applyDisable(analyzers, config), headPolicy),
          config.thresholds,
          headPolicy,
        ),
        config,
      ),
      config.analyzers,
    ),
    config.legacyInventory,
  );
}

function applyJavaConfig(analyzers, config) {
  const names = [
    ...GRADLE_PRESETS,
    PYTHON_ANALYZER_NAME,
    ...(config.preset === 'python' ? [MUTATION_ANALYZER_NAME] : []),
  ];
  return analyzers.map((analyzer) =>
    names.includes(analyzer.name)
      ? configureJavaAnalyzer(analyzer, {
          kotlin: config.kotlin,
          tools: config.tools,
          exclude: config.exclude,
          legacyInventory: config.legacyInventory ?? DEFAULT_LEGACY_INVENTORY,
          ...(analyzer.name === MUTATION_ANALYZER_NAME
            ? { thresholds: { crapLimit: config.thresholds?.crapLimit } }
            : {
                thresholds: config.thresholds,
                exceptions: config.exceptions,
                duplicates: config.duplicates,
              }),
        })
      : analyzer,
  );
}

function createCustomAnalyzer({ name, command, args = [] }) {
  return {
    name,
    version: 'custom',
    configurationHash: createHash('sha256')
      .update(JSON.stringify({ name, command, args }))
      .digest('hex'),
    exclusions: [],
    createInvocation({ projectRoot, snapshot }) {
      return {
        command,
        args,
        cwd: projectRoot,
        env: {
          ...process.env,
          NITPICKER_ANALYZER: name,
          NITPICKER_PROJECT_ROOT: projectRoot,
          ...(snapshot === undefined ? {} : { NITPICKER_SNAPSHOT: snapshot }),
        },
      };
    },
  };
}

function addCustomAnalyzers(analyzers, entries = []) {
  const taken = new Set(analyzers.map(({ name }) => name));
  const custom = entries.map((entry) => {
    if (taken.has(entry.name)) {
      throw new Error(
        `nitpicker.config.json: analyzers entry "${entry.name}" clashes with another analyzer name`,
      );
    }
    taken.add(entry.name);
    return createCustomAnalyzer(entry);
  });
  return [...analyzers, ...custom];
}
