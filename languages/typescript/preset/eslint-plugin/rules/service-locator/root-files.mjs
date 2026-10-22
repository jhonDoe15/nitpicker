import path from 'node:path';
import { isCompositionRootFile } from '../boundaries/composition-root-files.mjs';

export const rootFileOptionsSchema = [
  {
    type: 'object',
    properties: {
      compositionRootPattern: { type: 'string' },
      entryPoints: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
];

export function rootFileMatcher(options) {
  const entryPoints = options?.entryPoints ?? [];
  return (fileName) => {
    const normalized = fileName.replaceAll('\\', '/');
    return (
      isCompositionRootFile({ filename: normalized, options: [options] }) ||
      entryPoints.some((glob) => path.posix.matchesGlob(normalized, `**/${glob}`))
    );
  };
}
