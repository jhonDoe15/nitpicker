import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { kotlinRuleAliasNotices } from '../../../languages/java/adapters/kotlin/kotlin-options.mjs';
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

function rawConfig(projectRoot) {
  const file = path.join(projectRoot, CONFIG_FILE_NAME);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

function jvmDescriber(config, headPolicy, projectRoot) {
  const renamed = kotlinRuleAliasNotices(rawConfig(projectRoot));
  return (changedFiles) => [
    ...renamed,
    ...jvmOutsideRootsNotices(changedFiles, {
      preset: config.preset,
      exclude: headPolicy.exclude,
      declaredRoots: readBuildSources(
        projectRoot,
        listedFiles(projectRoot).filter((file) => BUILD_FILE.test(file)),
      )
        .filter(({ type }) => type === 'roots')
        .flatMap(({ roots }) => roots),
    }),
  ];
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

function coChangeDescriber(config, headPolicy, projectRoot) {
  return runsCoChange(config)
    ? (changedFiles, { mergeBaseSha, touchedPaths } = {}) =>
        coChangeNotices({
          projectRoot,
          policy: headPolicy,
          ref: mergeBaseSha,
          changedPaths: touchedPaths ?? changedFiles,
        })
    : undefined;
}

export function noticeDescriber(config, headPolicy, projectRoot) {
  const describers = [
    languageDescriber(config, headPolicy, projectRoot),
    coChangeDescriber(config, headPolicy, projectRoot),
  ].filter((describer) => describer !== undefined);
  return describers.length === 0
    ? undefined
    : (changedFiles, context) => describers.flatMap((describe) => describe(changedFiles, context));
}

export function historyAvailabilityNotes(config, headPolicy, projectRoot) {
  if (!runsCoChange(config)) {
    return [];
  }
  return availabilityNotices({ projectRoot, policy: headPolicy });
}
