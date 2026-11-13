import {
  availabilityNotices,
  coChangeNotices,
} from '../../../shared/history/co-change/notices.mjs';
import { CHANGE_HISTORY_TOOL } from '../../../shared/project-rules/hygiene-rules.mjs';
import { jvmOutsideRootsNotices } from '../../../languages/java/adapters/notices/outside-roots-notice.mjs';
import { declaredSourceRoots } from '../../../languages/java/adapters/notices/declared-roots.mjs';
import { pythonOutsideRootsNotices } from '../../../languages/python/adapters/notices/outside-roots-notice.mjs';
import { testFileMatcher } from '../../../languages/python/adapters/analysis/python-sources.mjs';
import { detectSourceRoots } from '../../../languages/python/adapters/execution/python-project.mjs';
import { outsideRootsNotices } from '../../../languages/typescript/preset/notices/outside-roots-notice.mjs';
import { projectFilePaths } from '../../../shared/project-files/project-files.mjs';
import {
  LAYOUT_ROOT_KEYS,
  unmatchedLayoutRootNotices,
} from '../../../shared/notices/layout-roots-notice.mjs';

import type { NitpickerConfig } from '../../configuration/config-types.mts';
import { fieldOf, objectOf, textsOf } from '../../../shared/values/readers.mts';

type NoticeContext = { readonly mergeBaseSha?: unknown; readonly touchedPaths?: readonly string[] };
type Describer = (changedFiles: readonly string[], context?: NoticeContext) => readonly string[];
type Notices<Options> = (changedFiles: readonly string[], options: Options) => readonly string[];

const jvmNotices: Notices<object> = jvmOutsideRootsNotices;
const pythonNotices: Notices<object> = pythonOutsideRootsNotices;
const typescriptNotices: Notices<unknown> = outsideRootsNotices;
const layoutNotices: (layout: unknown, files: unknown) => readonly string[] =
  unmatchedLayoutRootNotices;
const coChangeNoticesOf: (request: {
  readonly projectRoot: string;
  readonly policy: object | undefined;
  readonly ref: unknown;
  readonly changedPaths: readonly string[];
}) => readonly string[] = coChangeNotices;
const sourceRootsOf: (projectRoot: string, declared: unknown) => unknown = detectSourceRoots;
const layoutRootKeys: readonly string[] = LAYOUT_ROOT_KEYS;

const TYPESCRIPT_PRESETS = new Set([undefined, 'typescript']);

function jvmDescriber(
  config: NitpickerConfig,
  headPolicy: unknown,
  projectRoot: string,
): Describer {
  return (changedFiles) =>
    jvmNotices(changedFiles, {
      preset: config.preset,
      exclude: fieldOf(headPolicy, 'exclude'),
      declaredRoots: declaredSourceRoots(projectRoot),
    });
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
        exclude: fieldOf(headPolicy, 'exclude'),
        isTestFile: testFileMatcher(projectRoot),
      });
  }
  return config.preset === 'java' || config.preset === 'kotlin'
    ? jvmDescriber(config, headPolicy, projectRoot)
    : undefined;
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

export function noticeDescriber(
  config: NitpickerConfig,
  headPolicy: unknown,
  projectRoot: string,
): Describer | undefined {
  const describers = [
    languageDescriber(config, headPolicy, projectRoot),
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
): unknown {
  if (!runsCoChange(config)) {
    return [];
  }
  return availabilityNotices({ projectRoot, policy: objectOf(headPolicy) });
}
