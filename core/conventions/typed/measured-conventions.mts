import {
  detectConventions,
  globMatcher,
  isJavascriptPolicy,
  prettierPatterns,
  resolveLayout,
} from './convention-views.mts';
import { objectOf, textsOf } from '../../../shared/values/readers.mts';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import type {
  Accepts,
  ConventionDefinition,
  DetectRequest,
  DetectedConventions,
  HeadPolicy,
} from './convention-types.mts';

const TEST_SUPPORT_PATH = /(?:^|\/)(?:test-support|test-utils|testing|testkit)\//;

export function layoutFilter(config: NitpickerConfig, headPolicy: HeadPolicy): Accepts {
  const layout = resolveLayout(objectOf(headPolicy['layout']), textsOf(headPolicy['exclude']), {
    javascript: isJavascriptPolicy(config),
    generatedFiles: headPolicy['generatedFiles'],
  });
  const formatted = prettierPatterns(layout).map(globMatcher);
  const scopes: Readonly<Record<string, (file: string) => boolean>> = {
    layout: (file: string) => layout.isSourceFile(file) || layout.isTestFile(file),
    'test-code': (file: string) => layout.isTestFile(file) || TEST_SUPPORT_PATH.test(file),
    'formatted-data': (file: string) =>
      formatted.some((pattern) => pattern.test(file)) &&
      !layout.isGeneratedPath(file) &&
      !layout.isFixturePath(file),
  };
  return function accepts({ scope }: ConventionDefinition, file: string): boolean {
    return scope === undefined || (scopes[scope]?.(file) === true && !layout.isExcluded(file));
  };
}

export function detect({
  definitions,
  pinned,
  exclude,
  accepts,
  sources,
}: DetectRequest): DetectedConventions {
  if (definitions.every(({ id }) => pinned[id] !== undefined)) {
    return detectConventions({ definitions, pinned, exclude, source: undefined });
  }
  const settings = { pinned, exclude, accepts };
  if (sources.base === undefined) {
    return detectConventions({ ...settings, definitions, source: sources.head });
  }
  const measured = detectConventions({ ...settings, definitions, source: sources.base });
  const unmeasured = definitions.filter(({ id }) => isUnmeasured(measured[id]));
  return unmeasured.length === 0
    ? measured
    : {
        ...measured,
        ...detectConventions({
          ...settings,
          definitions: unmeasured,
          source: sources.head,
        }),
      };
}

function isUnmeasured(entry: DetectedConventions[string] | undefined): boolean {
  return entry?.files === 0;
}
