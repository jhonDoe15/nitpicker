import { PACKAGE_ROOT } from '../../../../core/tooling/tool-resolution.mts';
import { parseArguments } from '../quality-areas/arguments.mts';
import type { QualityAreaOptions } from '../quality-areas/typed/area-types.mts';

export type PickLanguage = {
  readonly extension: string;
  readonly source: string;
  readonly config: Readonly<Record<string, unknown>>;
};

export { compareFindings } from '../../../../core/diff/comparison/compare.mts';

export function areaOptions(
  kind: string,
  projectRoot: string,
  environment: Readonly<Record<string, string | undefined>> = {},
): QualityAreaOptions {
  return parseArguments(
    [
      ...['--analyzer-name', kind, '--kind', kind],
      ...['--project-root', projectRoot, '--policy-root', PACKAGE_ROOT],
      ...['--tool-root', PACKAGE_ROOT, '--snapshot', 'head'],
    ],
    environment,
  );
}
