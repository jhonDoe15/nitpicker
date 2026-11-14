import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mjs';
import { compareFindings as untypedCompareFindings } from '../../../../core/diff/comparison/compare.mjs';
import { parseArguments } from '../quality-areas/arguments.mts';
import type { QualityAreaOptions } from '../quality-areas/typed/area-types.mts';
import type { Finding } from '../static-checks/shared.mts';

export type PickLanguage = {
  readonly extension: string;
  readonly source: string;
  readonly config: Readonly<Record<string, unknown>>;
};

export const compareFindings: (input: {
  readonly baseFindings: readonly Finding[];
  readonly headFindings: readonly Finding[];
  readonly touchedCode: undefined;
  readonly unknownOnBase: undefined;
}) => Readonly<Record<string, readonly Finding[] | undefined>> = untypedCompareFindings;

export function areaOptions(kind: string, projectRoot: string): QualityAreaOptions {
  return parseArguments([
    ...['--analyzer-name', kind, '--kind', kind],
    ...['--project-root', projectRoot, '--policy-root', PACKAGE_ROOT],
    ...['--tool-root', PACKAGE_ROOT, '--snapshot', 'head'],
  ]);
}
