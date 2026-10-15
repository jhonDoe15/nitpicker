import { escapeRegExp } from '../../../../shared/glob.mjs';
import { FOLDER_DEPTH_DEFAULTS } from '../../../../shared/policy.mjs';
import { folderDepthFindings } from '../../../../shared/rules/size/folder-depth.mjs';

const WORDING = {
  subject: 'Folder',
  below: 'features/<feature>/<layer>/',
  advice: (limit) =>
    `Keep files at most ${String(limit)} folder${limit === 1 ? '' : 's'} below it, or move them into a feature of their own.`,
};

function featureDepthPattern(layout) {
  const roots = [...layout.sourceRoots, ...layout.testRoots].map(escapeRegExp).join('|');
  return new RegExp(`^(?:${roots})/(?:[^/]+/)*?features/[^/]+/[^/]+/(?<rest>.+)$`);
}

export function typescriptFolderDepthFindings(entries, { analyzerName, layout, policy }) {
  const pattern = featureDepthPattern(layout);
  return folderDepthFindings(entries, {
    analyzerName,
    limit: policy.thresholds.folderDepth ?? FOLDER_DEPTH_DEFAULTS.typescript,
    exceptions: policy.exceptions,
    wording: WORDING,
    depthOf: (file) => {
      const rest = pattern.exec(file.path)?.groups?.rest;
      return rest === undefined ? undefined : rest.split('/').length - 1;
    },
  });
}
