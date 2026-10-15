import { FOLDER_DEPTH_DEFAULTS } from '../../../../shared/policy.mjs';
import { folderDepthFindings } from '../../../../shared/rules/size/folder-depth.mjs';

const WORDING = {
  subject: 'Package',
  below: 'the root package',
  advice: (limit) =>
    `Keep packages at most ${String(limit)} levels below the root package: group by responsibility instead of nesting.`,
};

function segments(packagePath) {
  return packagePath === '' ? [] : packagePath.split('/');
}

function commonPrefixLength(entries) {
  const paths = entries.map(({ packagePath }) => segments(packagePath));
  const [first, ...others] = paths;
  const divergence = first.findIndex((part, index) =>
    others.some((other) => other[index] !== part),
  );
  return divergence === -1 ? first.length : divergence;
}

export function javaFolderDepthFindings(entries, { analyzerName, thresholds = {}, exceptions }) {
  if (entries.length === 0) {
    return [];
  }
  const rootLength = commonPrefixLength(entries);
  return folderDepthFindings(entries, {
    analyzerName,
    limit: thresholds.folderDepth ?? FOLDER_DEPTH_DEFAULTS.java,
    exceptions,
    wording: WORDING,
    depthOf: ({ packagePath }) => segments(packagePath).length - rootLength,
  });
}
