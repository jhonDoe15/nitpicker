import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { kotlinRuleAliasNotices } from '../../../languages/java/adapters/kotlin/kotlin-options.mts';
import {
  availabilityNotices,
  coChangeNotices,
} from '../../../shared/history/co-change/notices.mjs';
import { CHANGE_HISTORY_TOOL } from '../../../shared/project-rules/hygiene-rules.mjs';
import { jvmOutsideRootsNotices } from '../../../languages/java/adapters/notices/outside-roots-notice.mts';
import { declaredSourceRoots } from '../../../languages/java/adapters/notices/declared-roots.mts';
import {
  type OutsideProject,
  pythonOutsideRootsNotices,
} from '../../../languages/python/adapters/notices/outside-roots-notice.mts';
import { testFileMatcher } from '../../../languages/python/adapters/analysis/python-sources.mts';
import { detectSourceRoots } from '../../../languages/python/adapters/execution/python-project.mts';
import { outsideRootsNotices } from '../../../languages/typescript/preset/notices/outside-roots-notice.mts';
import { projectFilePaths } from '../../../shared/project-files/project-files.mjs';
import {
  LAYOUT_ROOT_KEYS,
  unmatchedLayoutRootNotices,
} from '../../../shared/notices/layout-roots-notice.mjs';

import { uncheckedLanguageNotices } from './unchecked-languages.mts';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import { fieldOf, objectOf, textOf, textsOf } from '../../../shared/values/readers.mts';

const EXCLUDE_KEY = 'exclude';

type NoticeContext = { readonly mergeBaseSha?: unknown; readonly touchedPaths?: readonly string[] };
type Describer = (changedFiles: readonly string[], context?: NoticeContext) => readonly string[];
type Notices<Options> = (changedFiles: readonly string[], options: Options) => readonly string[];

const jvmNotices: Notices<object> = jvmOutsideRootsNotices;
const renamedRuleNotices: (config: unknown) => readonly string[] = kotlinRuleAliasNotices;
const pythonNotices: Notices<OutsideProject> = pythonOutsideRootsNotices;
const typescriptNotices: Notices<unknown> = outsideRootsNotices;
const layoutNotices: (layout: unknown, files: unknown) => readonly string[] =
  unmatchedLayoutRootNotices;
const coChangeNoticesOf: (request: {
  readonly projectRoot: string;
  readonly policy: object | undefined;
  readonly ref: unknown;
  readonly changedPaths: readonly string[];
}) => readonly string[] = coChangeNotices;
function sourceRootsOf(projectRoot: string, declared: unknown): readonly string[] {
  return detectSourceRoots(projectRoot, Array.isArray(declared) ? declared.map(textOf) : undefined);
}
const layoutRootKeys: readonly string[] = LAYOUT_ROOT_KEYS;

const TYPESCRIPT_PRESETS = new Set([undefined, 'typescript']);

function rawConfig(projectRoot: string): unknown {
  const file = path.join(projectRoot, CONFIG_FILE_NAME);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

function jvmDescriber(
  config: NitpickerConfig,
  headPolicy: unknown,
  projectRoot: string,
): Describer {
  const renamed = renamedRuleNotices(rawConfig(projectRoot));
  return (changedFiles) => [
    ...renamed,
    ...jvmNotices(changedFiles, {
      preset: config.preset,
      exclude: fieldOf(headPolicy, EXCLUDE_KEY),
      declaredRoots: declaredSourceRoots(projectRoot),
    }),
  ];
}

function languageDescriber(
  config: NitpickerConfig,
  headPolicy: unknown,
  projectRoot: string,
): Describer | undefined {
  if (TYPESCRIPT_PRESETS.has(config.preset)) {
    return (changedFiles) => typescriptNotices(changedFiles, headPolicy);
  }
  if (config.preset === 'python') {
    return (changedFiles) =>
      pythonNotices(changedFiles, {
        projectRoot,
        sourceRoots: sourceRootsOf(projectRoot, fieldOf(config.python, 'sourceRoots')),
        exclude: textsOf(fieldOf(headPolicy, EXCLUDE_KEY)),
        isTestFile: testFileMatcher(projectRoot),
      });
  }
  return config.preset === 'java' || config.preset === 'kotlin'
    ? jvmDescriber(config, headPolicy, projectRoot)
    : undefined;
}

function uncheckedDescriber(
  config: NitpickerConfig,
  headPolicy: unknown,
  projectRoot: string,
): Describer {
  const request = {
    preset: config.preset,
    projectRoot,
    exclude: textsOf(fieldOf(headPolicy, EXCLUDE_KEY)),
  };
  return (changedFiles) => uncheckedLanguageNotices(changedFiles, request);
}

function layoutDescriber(layout: unknown, projectRoot: string): Describer | undefined {
  return layoutRootKeys.some((key) => fieldOf(layout, key) !== undefined)
    ? () => layoutNotices(layout, projectFilePaths(projectRoot))
    : undefined;
}

function runsCoChange(config: NitpickerConfig): boolean {
  return (
    config.history?.coChange === true && !textsOf(config['disable']).includes(CHANGE_HISTORY_TOOL)
  );
}

function coChangeDescriber(
  config: NitpickerConfig,
  headPolicy: unknown,
  projectRoot: string,
): Describer | undefined {
  return runsCoChange(config)
    ? (changedFiles, { mergeBaseSha, touchedPaths } = {}) =>
        coChangeNoticesOf({
          projectRoot,
          policy: objectOf(headPolicy),
          ref: mergeBaseSha,
          changedPaths: touchedPaths ?? changedFiles,
        })
    : undefined;
}

function policyNotices(headPolicy: unknown): readonly string[] {
  return textsOf(fieldOf(fieldOf(fieldOf(headPolicy, 'tools'), 'tests'), 'notices'));
}

export function noticeDescriber(
  config: NitpickerConfig,
  headPolicy: unknown,
  projectRoot: string,
): Describer | undefined {
  const notices = policyNotices(headPolicy);
  const describers = [
    notices.length === 0 ? undefined : () => notices,
    languageDescriber(config, headPolicy, projectRoot),
    uncheckedDescriber(config, headPolicy, projectRoot),
    coChangeDescriber(config, headPolicy, projectRoot),
    layoutDescriber(fieldOf(headPolicy, 'layout'), projectRoot),
  ].filter((describer) => describer !== undefined);
  return describers.length === 0
    ? undefined
    : (changedFiles, context) => describers.flatMap((describe) => describe(changedFiles, context));
}

export function historyAvailabilityNotes(
  config: NitpickerConfig,
  headPolicy: unknown,
  projectRoot: string,
): readonly string[] {
  if (!runsCoChange(config)) {
    return [];
  }
  return textsOf(availabilityNotices({ projectRoot, policy: objectOf(headPolicy) }));
}

export function snapshotNotes(
  config: NitpickerConfig,
  headPolicy: unknown,
  projectRoot: string,
): readonly string[] {
  return [
    ...policyNotices(headPolicy),
    ...historyAvailabilityNotes(config, headPolicy, projectRoot),
  ];
}
