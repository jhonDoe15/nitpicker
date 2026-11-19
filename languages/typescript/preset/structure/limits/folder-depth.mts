import type { Finding } from '../../../adapters/static-checks/shared.mts';
import {
  FOLDER_DEPTH_DEFAULTS,
  folderDepthFindings,
  rootExpression,
} from '../typed/rule-views.mts';
import type { SizedFile, StructureLayout, StructurePolicy } from '../typed/structure-types.mts';

const WORDING = {
  subject: 'Folder',
  below: 'features/<feature>/<layer>/',
  advice: (limit: number) =>
    `Keep files at most ${String(limit)} folder${limit === 1 ? '' : 's'} below it, or move them into a feature of their own.`,
};

const COLOCATED_FOLDERS = new Set(['__tests__', '__mocks__']);

function countedFolders(rest: string): number {
  return rest
    .split('/')
    .slice(0, -1)
    .filter((folder) => !COLOCATED_FOLDERS.has(folder)).length;
}

function featureDepthPattern(layout: StructureLayout): RegExp {
  const roots = rootExpression([...layout.sourceRoots, ...layout.testRoots]);
  return new RegExp(`^${roots.source}(?:[^/]+/)*?features/[^/]+/[^/]+/(?<rest>.+)$`);
}

export function typescriptFolderDepthFindings(
  entries: readonly SizedFile[],
  {
    analyzerName,
    layout,
    policy,
  }: { analyzerName: string; layout: StructureLayout; policy: StructurePolicy },
): Finding[] {
  const pattern = featureDepthPattern(layout);
  return folderDepthFindings(entries, {
    analyzerName,
    limit: policy.thresholds.folderDepth ?? FOLDER_DEPTH_DEFAULTS.typescript,
    exceptions: policy.exceptions,
    wording: WORDING,
    depthOf: (file) => {
      const rest = pattern.exec(file.path)?.groups?.['rest'];
      return rest === undefined ? undefined : countedFolders(rest);
    },
  });
}
