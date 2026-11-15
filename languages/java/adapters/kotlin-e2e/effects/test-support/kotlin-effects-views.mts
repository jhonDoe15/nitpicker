import type { Finding } from '../../../../../../shared/values/findings.mts';
import { fieldOf, listOf, textsOf } from '../../../../../../shared/values/readers.mts';
import { loadConfig as untypedLoadConfig } from '../../../../../../core/configuration/config.mts';
import { readEffectsFindings as untypedReadEffectsFindings } from '../../../effects/effects-findings.mjs';
import { effectsSummary as untypedEffectsSummary } from '../../../effects/test-support/effects-projects.mjs';
import {
  sourceFileOf as untypedSourceFileOf,
  sourceLocator as untypedSourceLocator,
} from '../../../reporting/kotlin-reports.mjs';

type Locator = (packageDirectory: string, fileName: string) => string | undefined;

export const loadConfig: (projectRoot: string) => unknown = untypedLoadConfig;
export const sourceLocator: (projectRoot: string, sourceRoots: string[]) => Locator =
  untypedSourceLocator;
export const sourceFileOf: (
  locate: Locator,
  className: string,
  fileName: string | undefined,
) => string | undefined = untypedSourceFileOf;
export const readEffectsFindings: (
  reportRoot: string,
  options: {
    readonly resolvePath: (className: string, fileName: string | undefined) => string | undefined;
    readonly kotlin: boolean;
  },
) => Finding[] = untypedReadEffectsFindings;

export function effectsSummary(report: unknown): string[] {
  return textsOf(untypedEffectsSummary({ violations: listOf(fieldOf(report, 'violations')) }));
}
