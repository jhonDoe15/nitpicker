import { FOLDER_DEPTH_DEFAULTS } from '../../../../shared/project-rules/size-rules.mjs';
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

const DESCRIPTORS = new Set(['module-info.java', 'package-info.java']);

function votesForRoot({ path: file, packagePath }) {
  return packagePath !== '' && !DESCRIPTORS.has(file.slice(file.lastIndexOf('/') + 1));
}

function commonPrefix(entries) {
  const voting = entries.filter(votesForRoot);
  if (voting.length === 0) {
    return [];
  }
  const [first, ...others] = voting.map(({ packagePath }) => segments(packagePath));
  const divergence = first.findIndex((part, index) =>
    others.some((other) => other[index] !== part),
  );
  return first.slice(0, divergence === -1 ? first.length : divergence);
}

function depthBelow(root, packagePath) {
  const parts = segments(packagePath);
  const underRoot = root.every((part, index) => parts[index] === part);
  return underRoot ? parts.length - root.length : parts.length;
}

export function javaFolderDepthFindings(
  entries,
  { analyzerName, thresholds = {}, exceptions, rootEntries = entries },
) {
  if (entries.length === 0) {
    return [];
  }
  const root = commonPrefix(rootEntries.length === 0 ? entries : rootEntries);
  return folderDepthFindings(entries, {
    analyzerName,
    limit: thresholds.folderDepth ?? FOLDER_DEPTH_DEFAULTS.java,
    exceptions,
    wording: WORDING,
    depthOf: ({ packagePath }) => depthBelow(root, packagePath),
  });
}
