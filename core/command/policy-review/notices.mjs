import { jvmOutsideRootsNotices } from '../../../languages/java/adapters/notices/outside-roots-notice.mjs';
import { readBuildSources } from '../../../languages/java/builds/narrowing/build-sources.mjs';
import { listedFiles } from '../../policy-changes/policy-scope.mjs';
import { pythonOutsideRootsNotices } from '../../../languages/python/adapters/notices/outside-roots-notice.mjs';
import { testFileMatcher } from '../../../languages/python/adapters/analysis/python-sources.mjs';
import { detectSourceRoots } from '../../../languages/python/adapters/execution/python-project.mjs';
import { outsideRootsNotices } from '../../../languages/typescript/preset/notices/outside-roots-notice.mjs';

const TYPESCRIPT_PRESETS = new Set([undefined, 'typescript']);
const BUILD_FILE = /(?:^|\/)(?:build\.gradle(?:\.kts)?|pom\.xml)$/u;

export function policyNotices(headPolicy) {
  return headPolicy.tools?.tests?.notices ?? [];
}

function jvmDescriber(config, headPolicy, projectRoot) {
  return (changedFiles) =>
    jvmOutsideRootsNotices(changedFiles, {
      preset: config.preset,
      exclude: headPolicy.exclude,
      declaredRoots: readBuildSources(
        projectRoot,
        listedFiles(projectRoot).filter((file) => BUILD_FILE.test(file)),
      )
        .filter(({ type }) => type === 'roots')
        .flatMap(({ roots }) => roots),
    });
}

function presetDescriber(config, headPolicy, projectRoot) {
  if (TYPESCRIPT_PRESETS.has(config.preset)) {
    return (changedFiles) => outsideRootsNotices(changedFiles, headPolicy);
  }
  if (config.preset === 'python') {
    return (changedFiles) =>
      pythonOutsideRootsNotices(changedFiles, {
        projectRoot,
        sourceRoots: detectSourceRoots(projectRoot, config.python?.sourceRoots),
        exclude: headPolicy.exclude,
        isTestFile: testFileMatcher(projectRoot),
      });
  }
  return config.preset === 'java' || config.preset === 'kotlin'
    ? jvmDescriber(config, headPolicy, projectRoot)
    : undefined;
}

export function noticeDescriber(config, headPolicy, projectRoot) {
  const notices = policyNotices(headPolicy);
  const describe = presetDescriber(config, headPolicy, projectRoot);
  if (describe === undefined) {
    return notices.length === 0 ? undefined : () => notices;
  }
  return (changedFiles) => [...notices, ...describe(changedFiles)];
}
