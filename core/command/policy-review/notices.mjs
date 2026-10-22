import {
  availabilityNotices,
  coChangeNotices,
} from '../../../shared/history/co-change/notices.mjs';
import { CHANGE_HISTORY_TOOL } from '../../../shared/project-rules/hygiene-rules.mjs';
import { jvmOutsideRootsNotices } from '../../../languages/java/adapters/notices/outside-roots-notice.mjs';
import { readBuildSources } from '../../../languages/java/builds/narrowing/build-sources.mjs';
import { listedFiles } from '../../policy-changes/policy-scope.mjs';
import { pythonOutsideRootsNotices } from '../../../languages/python/adapters/notices/outside-roots-notice.mjs';
import { testFileMatcher } from '../../../languages/python/adapters/analysis/python-sources.mjs';
import { detectSourceRoots } from '../../../languages/python/adapters/execution/python-project.mjs';
import { outsideRootsNotices } from '../../../languages/typescript/preset/notices/outside-roots-notice.mjs';

const TYPESCRIPT_PRESETS = new Set([undefined, 'typescript']);
const BUILD_FILE = /(?:^|\/)(?:build\.gradle(?:\.kts)?|pom\.xml)$/u;

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

function languageDescriber(config, headPolicy, projectRoot) {
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

function runsCoChange(config) {
  return config.history?.coChange === true && !(config.disable ?? []).includes(CHANGE_HISTORY_TOOL);
}

export function noticeDescriber(config, headPolicy, projectRoot) {
  const describers = [
    languageDescriber(config, headPolicy, projectRoot),
    runsCoChange(config)
      ? (changedFiles) => coChangeNotices({ projectRoot, policy: headPolicy, changedFiles })
      : undefined,
  ].filter((describer) => describer !== undefined);
  return describers.length === 0
    ? undefined
    : (changedFiles) => describers.flatMap((describe) => describe(changedFiles));
}

export function historyAvailabilityNotes(config, headPolicy, projectRoot) {
  if (!runsCoChange(config)) {
    return [];
  }
  return availabilityNotices({ projectRoot, policy: headPolicy });
}
