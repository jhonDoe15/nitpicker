import { createHash } from 'node:crypto';
import { EXCEPTION_SEPARATOR } from '../../../core/tooling/runner-arguments.mjs';
import { withLegacyInventory } from '../../../shared/legacy-inventory.mjs';
import { configError, liftsOnlyRules } from '../../../shared/config.mjs';
import { JAVA_NATIVE_RULES, SHARED_EXCEPTION_RULES } from '../../../shared/policy.mjs';

const FILE_LIMIT_THRESHOLDS = ['fileLines', 'testFileLines', 'lineLength', 'folderFiles'];
const TYPESCRIPT_ONLY_KEYS = ['layout', 'exceptions', 'react', 'tools'];
const NATIVE_LINE_LENGTH = {
  java: 'Checkstyle checks Java line length; set it in config/checkstyle/checkstyle.xml',
  kotlin: 'detekt checks Kotlin line length; set style>MaxLineLength in config/detekt/detekt.yml',
};
const JAVA_EXCEPTION_RULES = SHARED_EXCEPTION_RULES.filter(
  (rule) => !JAVA_NATIVE_RULES.includes(rule),
);

export function validateJavaConfig(config) {
  const unsupported = TYPESCRIPT_ONLY_KEYS.filter(
    (key) => config[key] !== undefined && !isLiftedKey(config, key),
  );
  if (unsupported.length > 0) {
    const preset = config.preset;
    const notSupported = TYPESCRIPT_ONLY_KEYS.join(', ');
    const liftable = JAVA_EXCEPTION_RULES.join(', ');
    throw configError(
      `"${unsupported[0]}" is not supported with "preset": "${preset}": it describes the TypeScript source layout and ESLint rules, which the ${preset} preset does not have. Not supported with ${preset}: ${notSupported}, except exceptions for ${liftable}. Shared by all presets: thresholds, exclude, legacyInventory`,
    );
  }
  if (config.thresholds?.lineLength !== undefined) {
    throw configError(
      `"thresholds.lineLength" is not supported with "preset": "${config.preset}": ${NATIVE_LINE_LENGTH[config.preset]}`,
    );
  }
}

function isLiftedKey(config, key) {
  return (
    key === 'exceptions' &&
    (config.preset === 'kotlin' || liftsOnlyRules(config.exceptions, JAVA_EXCEPTION_RULES))
  );
}

function runnerArguments({ thresholds, exclude, exceptions, kotlin, duplicates }) {
  const fileLimits = fileLimitThresholds(thresholds);
  return [
    ...(thresholds.crapLimit === undefined ? [] : ['--crap-limit', String(thresholds.crapLimit)]),
    ...exclude.flatMap((glob) => ['--exclude', glob]),
    ...(fileLimits === undefined ? [] : ['--file-limits', JSON.stringify(fileLimits)]),
    ...exceptions.flatMap(({ rule, paths }) =>
      paths.flatMap((glob) => ['--exception', `${rule}${EXCEPTION_SEPARATOR}${glob}`]),
    ),
    ...(kotlin.formatter === undefined ? [] : ['--kotlin-formatter', kotlin.formatter]),
    ...(kotlin.detektConfig === undefined ? [] : ['--kotlin-detekt-config', kotlin.detektConfig]),
    ...(duplicates.skippedFolders === undefined
      ? []
      : ['--duplicate-skipped-folders', JSON.stringify(duplicates.skippedFolders)]),
  ];
}

export function configureJavaAnalyzer(
  analyzer,
  { thresholds = {}, exclude = [], exceptions = [], legacyInventory, kotlin = {}, duplicates = {} },
) {
  const adapterArguments = runnerArguments({ thresholds, exclude, exceptions, kotlin, duplicates });
  if (adapterArguments.length === 0 && legacyInventory === undefined) {
    return analyzer;
  }
  const configured = {
    ...analyzer,
    configurationHash: hashWithArguments(analyzer.configurationHash, adapterArguments),
    createInvocation: (context) => {
      const invocation = analyzer.createInvocation(context);
      return {
        ...invocation,
        args: [
          ...invocation.args,
          ...adapterArguments,
          '--snapshot',
          context.snapshot ?? 'head',
          ...(context.projectPolicyRoot === undefined
            ? []
            : ['--policy-root', context.projectPolicyRoot]),
          ...(context.baselineRoot === undefined ? [] : ['--baseline-root', context.baselineRoot]),
        ],
      };
    },
  };
  return legacyInventory === undefined
    ? configured
    : withLegacyInventory(configured, legacyInventory);
}

function fileLimitThresholds(thresholds) {
  const limits = FILE_LIMIT_THRESHOLDS.filter((key) => thresholds[key] !== undefined);
  return limits.length === 0
    ? undefined
    : Object.fromEntries(limits.map((key) => [key, thresholds[key]]));
}

function hashWithArguments(configurationHash, adapterArguments) {
  return adapterArguments.length === 0
    ? configurationHash
    : createHash('sha256')
        .update(configurationHash)
        .update(JSON.stringify(adapterArguments))
        .digest('hex');
}
