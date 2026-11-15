import { conventionStyle } from '../definitions.mts';
import type { StyleParts } from '../typed/convention-types.mts';

export function projectStyle(
  preset: string | undefined,
  { config, projectRoot }: { config: Record<string, unknown>; projectRoot: string },
): StyleParts {
  return conventionStyle(preset, {
    config,
    projectRoot,
    headPolicy: undefined,
    source: { paths: () => [], readMany: () => new Map() },
    configRoot: () => ({ path: projectRoot, snapshot: 'head', dispose: () => {}, notes: [] }),
  });
}
