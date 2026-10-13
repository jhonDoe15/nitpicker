import { createHash } from 'node:crypto';
import { withLegacyInventory } from '../../../shared/legacy-inventory.mjs';

export const EXCEPTION_SEPARATOR = ':';

export function configureJavaAnalyzer(
  analyzer,
  { thresholds = {}, exclude = [], exceptions = [], legacyInventory, kotlin = {}, duplicates = {} },
) {
  if (
    thresholds.crapLimit === undefined &&
    exclude.length === 0 &&
    exceptions.length === 0 &&
    legacyInventory === undefined &&
    kotlin.formatter === undefined &&
    kotlin.detektConfig === undefined &&
    duplicates.skippedFolders === undefined
  ) {
    return analyzer;
  }
  const adapterArguments = [
    ...(thresholds.crapLimit === undefined ? [] : ['--crap-limit', String(thresholds.crapLimit)]),
    ...exclude.flatMap((glob) => ['--exclude', glob]),
    ...exceptions.flatMap(({ rule, paths }) =>
      paths.flatMap((glob) => ['--exception', `${rule}${EXCEPTION_SEPARATOR}${glob}`]),
    ),
    ...(kotlin.formatter === undefined ? [] : ['--kotlin-formatter', kotlin.formatter]),
    ...(kotlin.detektConfig === undefined ? [] : ['--kotlin-detekt-config', kotlin.detektConfig]),
    ...(duplicates.skippedFolders === undefined
      ? []
      : ['--duplicate-skipped-folders', JSON.stringify(duplicates.skippedFolders)]),
  ];
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

function hashWithArguments(configurationHash, adapterArguments) {
  return adapterArguments.length === 0
    ? configurationHash
    : createHash('sha256')
        .update(configurationHash)
        .update(JSON.stringify(adapterArguments))
        .digest('hex');
}
