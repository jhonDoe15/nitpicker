import { JAVA_CONVENTIONS } from '../../languages/java/conventions/java-conventions.mts';
import { KOTLIN_CONVENTIONS } from '../../languages/java/conventions/kotlin-conventions.mts';
import { PYTHON_CONVENTIONS } from '../../languages/python/conventions/python-conventions.mts';
import {
  JAVASCRIPT_CONVENTIONS,
  TYPESCRIPT_CONVENTIONS,
} from '../../languages/typescript/conventions/typescript-conventions.mts';
import { javaProjectStyle } from '../../languages/java/conventions/java-project-style.mts';
import { kotlinStyle } from '../../languages/java/conventions/kotlin-style.mts';
import { pythonStyle } from '../../languages/python/conventions/python-style.mts';
import { eslintConfigStyle } from '../../languages/typescript/preset/eslint-project/eslint-style.mjs';
import { scriptProjectToolNotices } from '../../languages/typescript/preset/project-tools/ignored-notices.mjs';
import {
  jscpdIgnoredNotices,
  strykerIgnoredNotices,
  testsIgnoredNotices,
  typescriptIgnoredNotices,
  type Notices,
} from './typed/style-views.mts';
import type {
  ConventionDefinition,
  StyleContext,
  StyleFactory,
  StyleParts,
} from './typed/convention-types.mts';

const BY_PRESET = new Map<string, readonly ConventionDefinition[]>([
  ['typescript', TYPESCRIPT_CONVENTIONS],
  ['javascript', JAVASCRIPT_CONVENTIONS],
  ['java', JAVA_CONVENTIONS],
  ['kotlin', [...JAVA_CONVENTIONS, ...KOTLIN_CONVENTIONS]],
  ['python', PYTHON_CONVENTIONS],
]);

export function conventionDefinitions(preset = 'typescript'): readonly ConventionDefinition[] {
  return BY_PRESET.get(preset) ?? [];
}

function noticeStyle(notices: Notices): StyleFactory {
  return (context: StyleContext) => ({
    unused: {},
    project: {},
    note: () => undefined,
    summary: () => notices(context),
  });
}

const jscpdStyle = noticeStyle(({ config, projectRoot }) =>
  jscpdIgnoredNotices(config, projectRoot),
);
const scriptStyle = noticeStyle((context: StyleContext) => [
  ...typescriptIgnoredNotices(context),
  ...strykerIgnoredNotices(context),
  ...testsIgnoredNotices(context),
]);
const scriptProjectToolStyle = noticeStyle(scriptProjectToolNotices);

const STYLES_BY_PRESET = new Map<string, readonly StyleFactory[]>([
  ['typescript', [scriptStyle, eslintConfigStyle, jscpdStyle, scriptProjectToolStyle]],
  ['javascript', [scriptStyle, eslintConfigStyle, jscpdStyle, scriptProjectToolStyle]],
  ['java', [javaProjectStyle, jscpdStyle]],
  ['kotlin', [javaProjectStyle, kotlinStyle, jscpdStyle]],
  ['python', [pythonStyle, jscpdStyle]],
]);
const NO_STYLE: StyleParts = { unused: {}, project: {}, note: () => undefined };

function mergedStyle(styles: readonly StyleParts[]): StyleParts {
  const derivers = styles.flatMap(({ derive }) => (derive === undefined ? [] : [derive]));
  return {
    unused: Object.fromEntries(styles.flatMap(({ unused }) => Object.entries(unused))),
    project: Object.fromEntries(styles.flatMap(({ project }) => Object.entries(project))),
    note: (id: string, choice: unknown) => styles.map(({ note }) => note(id, choice)).find(Boolean),
    summary: (conventions: unknown) =>
      styles.flatMap(({ summary }) => summary?.(conventions) ?? []),
    derive: (detected: unknown) =>
      Object.fromEntries(derivers.flatMap((derive) => Object.entries(derive(detected)))),
  };
}

export function conventionStyle(preset: string | undefined, context: StyleContext): StyleParts {
  const styles = STYLES_BY_PRESET.get(preset ?? 'typescript')?.map((style) => style(context));
  return styles === undefined ? NO_STYLE : mergedStyle(styles);
}
