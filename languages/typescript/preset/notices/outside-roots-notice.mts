import { outsideRootsNotice as untypedOutsideRootsNotice } from '../../../../shared/notices/outside-roots-message.mjs';
import { objectOf } from '../../../../shared/values/readers.mts';
import type { Layout } from '../../adapters/typed/head-policy.mts';
import { EXCLUDED_PATH_PATTERN, resolveLayoutFor as untypedResolveLayoutFor } from '../layout.mjs';

const outsideRootsNotice: (options: {
  files: string[];
  kind: string;
  where: string;
  effect: string;
  destination: string;
}) => string[] = untypedOutsideRootsNotice;
const resolveLayoutFor: (policy: object) => Layout = untypedResolveLayoutFor;

const TYPESCRIPT_FILE = /\.(?:ts|tsx|mts|cts)$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const TOOL_CONFIGURATION = /(?:^|\/)[^/]*\.config\.[cm]?tsx?$/;
const HIDDEN_FOLDER = /(?:^|\/)\.[^/]+\//;
const EXCLUDED_FOLDER = new RegExp(EXCLUDED_PATH_PATTERN);

export function outsideRootsNotices(changedFiles: Iterable<string>, headPolicy: unknown): string[] {
  const layout = resolveLayoutFor(objectOf(headPolicy) ?? {});
  const roots = [...layout.sourceRoots, ...layout.testRoots].map((root) => `${root}/`);
  const outside = [...changedFiles]
    .map((file) => file.replaceAll('\\', '/'))
    .filter(
      (file) =>
        TYPESCRIPT_FILE.test(file) &&
        !DECLARATION_FILE.test(file) &&
        !TOOL_CONFIGURATION.test(file) &&
        !HIDDEN_FOLDER.test(file) &&
        !EXCLUDED_FOLDER.test(file) &&
        !layout.isExcluded(file) &&
        !roots.some((root) => file.startsWith(root)),
    )
    .sort();
  return outsideRootsNotice({
    files: outside,
    kind: 'TypeScript',
    where: 'layout.sourceRoots and layout.testRoots',
    effect: 'so nothing checks {them}',
    destination: 'under a root or add {their} to layout.sourceRoots',
  });
}
