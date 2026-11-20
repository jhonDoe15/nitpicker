import { DUPLICATES_CONFIGURATION_FILES } from '../../duplicates/configuration-files.mts';
import { codeExtensionNames } from '../../layout.mts';
import { DEAD_CODE_CHECK_FILES } from '../../unused-api/check-files.mts';
import { MINUTE_MS } from '../constants.mts';
import { JAVASCRIPT_PRESET_FILE } from '../policy-files.mts';
import type { CheckExclusions, QualityCheck } from '../typed/check-types.mts';

export const SIZE_SCALED_DEADLINE = {
  timeoutMs: 5 * MINUTE_MS,
  timeoutScale: { perThousandFilesMs: 2 * MINUTE_MS, extensions: codeExtensionNames },
};

const jscpdVersion = 'unresolved';
const knipVersion = 'unresolved';

export function repositoryChecksFor(exclusions: CheckExclusions): QualityCheck[] {
  return [
    {
      name: 'duplicates',
      kind: 'duplicates',
      version: jscpdVersion,
      exclusions: exclusions.general,
      ...SIZE_SCALED_DEADLINE,
      shardWeight: 2,
      configurationFiles: [...DUPLICATES_CONFIGURATION_FILES, JAVASCRIPT_PRESET_FILE],
    },
    {
      name: 'dead-code',
      kind: 'dead-code',
      version: knipVersion,
      exclusions: exclusions.general,
      ...SIZE_SCALED_DEADLINE,
      shardWeight: 5,
      configurationFiles: DEAD_CODE_CHECK_FILES,
    },
  ];
}
